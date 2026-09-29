import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router, type CanActivateFn } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import type { AuthResponse, User, Role } from '@support-desk/contracts';
const base = '/api/v1';
@Injectable({ providedIn: 'root' })
export class Auth {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly user = signal<User | null>(null);
  readonly initialized = signal(false);
  private accessToken: string | null = null;
  private pending?: Observable<AuthResponse>;
  token() {
    return this.accessToken;
  }
  refreshing() {
    return this.pending;
  }
  accept(result: AuthResponse) {
    this.accessToken = result.accessToken;
    this.user.set(result.user);
  }
  clear() {
    this.accessToken = null;
    this.user.set(null);
  }
  fail() {
    this.clear();
    void this.router.navigateByUrl('/login');
  }
  refresh(): Observable<AuthResponse> {
    if (!this.pending)
      this.pending = this.http
        .post<AuthResponse>(`${base}/auth/refresh`, {}, { withCredentials: true })
        .pipe(
          tap((result) => this.accept(result)),
          catchError((error) => {
            this.clear();
            return throwError(() => error);
          }),
          finalize(() => (this.pending = undefined)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    return this.pending;
  }
  async initialize() {
    try {
      await firstValueFrom(this.refresh());
      this.user.set(await firstValueFrom(this.http.get<User>(`${base}/auth/me`)));
    } catch {
      this.clear();
    } finally {
      this.initialized.set(true);
    }
  }
  login(input: { email: string; password: string }) {
    return this.http
      .post<AuthResponse>(`${base}/auth/login`, input, { withCredentials: true })
      .pipe(tap((result) => this.accept(result)));
  }
  register(input: { email: string; password: string; displayName: string }) {
    return this.http
      .post<AuthResponse>(`${base}/auth/register`, input, { withCredentials: true })
      .pipe(tap((result) => this.accept(result)));
  }
  logout(all = false) {
    return this.http
      .post<void>(`${base}/auth/${all ? 'logout-all' : 'logout'}`, {}, { withCredentials: true })
      .pipe(tap(() => this.fail()));
  }
}
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  if (!req.url.startsWith(`${base}/`)) return next(req);
  const isPublic = /\/auth\/(login|register|refresh)$/.test(req.url);
  if (isPublic) return next(req);
  const replay = (accessToken: string) =>
    next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) auth.fail();
        return throwError(() => error);
      }),
    );
  const afterRefresh = (pending: Observable<AuthResponse>) =>
    pending.pipe(
      catchError((error: unknown) => {
        auth.fail();
        return throwError(() => error);
      }),
      switchMap((result) => replay(result.accessToken)),
    );
  const pending = auth.refreshing();
  if (pending) return afterRefresh(pending);
  const token = auth.token();
  const outgoing = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401)
        return throwError(() => error);
      // Un ancien appel peut recevoir son 401 après la fin du renouvellement partagé.
      const current = auth.token();
      if (current && current !== token) return replay(current);
      // next() rejoue en aval : le second 401 ne rentre pas dans cet intercepteur.
      return afterRefresh(auth.refresh());
    }),
  );
};
export const signedIn: CanActivateFn = () => {
  const auth = inject(Auth),
    router = inject(Router);
  return auth.initialized() && auth.user() ? true : router.parseUrl('/login');
};
export const guestOnly: CanActivateFn = () =>
  inject(Auth).user() ? inject(Router).parseUrl('/dashboard') : true;
export const allowedRoles =
  (...roles: Role[]): CanActivateFn =>
  () => {
    const auth = inject(Auth),
      router = inject(Router);
    return auth.user() && roles.includes(auth.user()!.role) ? true : router.parseUrl('/dashboard');
  };
export const safeError = (error: unknown): string => {
  if (error instanceof HttpErrorResponse) {
    const messages: Record<number, string> = {
      0: 'Connexion au serveur impossible.',
      401: 'Votre session a expiré. Reconnectez-vous.',
      403: 'Vous n’avez pas accès à cette action.',
      409: 'Cette action est incompatible avec l’état actuel.',
      422: 'Vérifiez les champs saisis.',
      429: 'Trop de tentatives. Patientez avant de réessayer.',
    };
    return messages[error.status] ?? 'Une erreur est survenue. Réessayez.';
  }
  return 'Une erreur est survenue.';
};
@Injectable({ providedIn: 'root' })
export class Notice {
  readonly text = signal('');
  error(error: unknown) {
    this.text.set(safeError(error));
  }
  success(message: string) {
    this.text.set(message);
  }
}
