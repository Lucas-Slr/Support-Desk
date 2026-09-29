import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Auth, authInterceptor, signedIn, guestOnly, allowedRoles, safeError } from './auth';
import type { User } from '@support-desk/contracts';
import type { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
const user: User = {
  id: 'user-id',
  email: 'c@example.fr',
  displayName: 'Camille',
  role: 'CUSTOMER',
  status: 'ACTIVE',
  createdAt: '2026-01-01',
};
describe('Authentification en mémoire et coordination HTTP', () => {
  let auth: Auth, http: HttpClient, backend: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => backend.verify());
  it('conserve le token en mémoire et ne touche pas aux stockages', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    auth.accept({ accessToken: 'memory-token', user });
    expect(auth.token()).toBe('memory-token');
    expect(local).not.toHaveBeenCalled();
    auth.clear();
    expect(auth.token()).toBeNull();
    local.mockRestore();
  });
  it('ajoute Bearer uniquement aux appels API protégés', () => {
    auth.accept({ accessToken: 'access', user });
    http.get('/api/v1/tickets').subscribe();
    expect(backend.expectOne('/api/v1/tickets').request.headers.get('Authorization')).toBe(
      'Bearer access',
    );
    http.get('https://example.org/api').subscribe();
    const external = backend.expectOne('https://example.org/api');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({});
    auth.login({ email: user.email, password: 'pass' }).subscribe();
    const login = backend.expectOne('/api/v1/auth/login');
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush({ accessToken: 'new', user });
  });
  it('initialise avec le cookie puis charge le profil avant de terminer', async () => {
    const initialized = auth.initialize();
    expect(auth.initialized()).toBe(false);
    const refresh = backend.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.withCredentials).toBe(true);
    refresh.flush({ accessToken: 'new', user });
    await Promise.resolve();
    backend.expectOne('/api/v1/auth/me').flush(user);
    await initialized;
    expect(auth.initialized()).toBe(true);
    expect(auth.user()).toEqual(user);
  });
  it('termine l’initialisation sans session', async () => {
    const initialized = auth.initialize();
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await initialized;
    expect(auth.initialized()).toBe(true);
    expect(auth.user()).toBeNull();
  });
  it('ne produit qu’un renouvellement pour plusieurs 401 simultanés', () => {
    auth.accept({ accessToken: 'old', user });
    const received: string[] = [];
    for (const path of ['tickets', 'auth/sessions'])
      http.get<string>(`/api/v1/${path}`).subscribe((value) => received.push(value));
    for (const path of ['tickets', 'auth/sessions'])
      backend.expectOne(`/api/v1/${path}`).flush({}, { status: 401, statusText: 'Unauthorized' });
    const renew = backend.expectOne('/api/v1/auth/refresh');
    renew.flush({ accessToken: 'new', user });
    for (const path of ['tickets', 'auth/sessions']) {
      const replay = backend.expectOne(`/api/v1/${path}`);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer new');
      replay.flush('ok');
    }
    expect(received).toEqual(['ok', 'ok']);
  });
  it('échoue sans boucle et efface la session si le refresh échoue', () => {
    auth.accept({ accessToken: 'old', user });
    let failed = false;
    http.get('/api/v1/tickets').subscribe({ error: () => (failed = true) });
    backend.expectOne('/api/v1/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend
      .expectOne('/api/v1/auth/refresh')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    expect(auth.user()).toBeNull();
    expect(auth.token()).toBeNull();
    backend.expectNone('/api/v1/auth/refresh');
  });
  it('met les nouveaux appels en attente pendant le renouvellement', () => {
    auth.accept({ accessToken: 'old', user });
    http.get('/api/v1/tickets').subscribe();
    backend.expectOne('/api/v1/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.get('/api/v1/auth/sessions').subscribe();
    backend.expectNone('/api/v1/auth/sessions');
    backend.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', user });
    backend.expectOne('/api/v1/tickets').flush([]);
    const waiting = backend.expectOne('/api/v1/auth/sessions');
    expect(waiting.request.headers.get('Authorization')).toBe('Bearer new');
    waiting.flush([]);
  });
  it('réutilise le token renouvelé pour un ancien 401 arrivé tardivement', () => {
    auth.accept({ accessToken: 'old', user });
    http.get('/api/v1/tickets').subscribe();
    http.get('/api/v1/auth/sessions').subscribe();
    const late = backend.expectOne('/api/v1/auth/sessions');
    backend.expectOne('/api/v1/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', user });
    backend.expectOne('/api/v1/tickets').flush([]);
    late.flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectNone('/api/v1/auth/refresh');
    const replay = backend.expectOne('/api/v1/auth/sessions');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer new');
    replay.flush([]);
  });
  it('conserve une session valide si le rejeu reçoit un refus de permission', () => {
    auth.accept({ accessToken: 'old', user });
    http.get('/api/v1/users').subscribe({ error: () => {} });
    backend.expectOne('/api/v1/users').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', user });
    backend.expectOne('/api/v1/users').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(auth.user()).toEqual(user);
  });
  it('ne rejoue pas une deuxième fois après le renouvellement', () => {
    auth.accept({ accessToken: 'old', user });
    http.get('/api/v1/tickets').subscribe({ error: () => {} });
    backend.expectOne('/api/v1/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh').flush({ accessToken: 'new', user });
    backend.expectOne('/api/v1/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectNone('/api/v1/auth/refresh');
    expect(auth.user()).toBeNull();
  });
  it('ne renouvelle pas pour un 403', () => {
    http.get('/api/v1/users').subscribe({ error: () => {} });
    backend.expectOne('/api/v1/users').flush({}, { status: 403, statusText: 'Forbidden' });
    backend.expectNone('/api/v1/auth/refresh');
  });
  it('protège les routes et adapte les rôles', () => {
    const route = {} as ActivatedRouteSnapshot,
      state = {} as RouterStateSnapshot;
    const run = (guard: typeof signedIn) =>
      TestBed.runInInjectionContext(() => guard(route, state));
    expect(run(signedIn)).not.toBe(true);
    auth.accept({ accessToken: 'x', user });
    auth.initialized.set(true);
    expect(run(signedIn)).toBe(true);
    expect(run(guestOnly)).not.toBe(true);
    expect(run(allowedRoles('ADMIN'))).not.toBe(true);
    auth.accept({ accessToken: 'x', user: { ...user, role: 'ADMIN' } });
    expect(run(allowedRoles('ADMIN'))).toBe(true);
  });
  it.each([401, 403, 409, 429])('affiche une erreur explicite pour %s', (status) => {
    expect(safeError(new HttpErrorResponse({ status }))).not.toBe(
      'Une erreur est survenue. Réessayez.',
    );
  });
});
