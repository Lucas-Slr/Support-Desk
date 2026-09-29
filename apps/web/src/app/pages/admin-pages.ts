import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import type { User, AuditEvent, Page } from '@support-desk/contracts';
import { Auth, Notice } from '../core/auth';
@Component({
  standalone: true,
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">ADMINISTRATION</span>
        <h1>Utilisateurs</h1>
        <p class="muted">Gérez les accès avec attention. Chaque modification est auditée.</p>
      </div>
    </div>
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>État</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr>
                <td>
                  <strong>{{ u.displayName }}</strong
                  ><small class="ticket-ref">{{ u.email }}</small>
                </td>
                <td>
                  <select #role [value]="u.role" [attr.aria-label]="'Rôle de ' + u.displayName">
                    <option value="CUSTOMER">Client</option>
                    <option value="AGENT">Agent</option>
                    <option value="ADMIN">Administrateur</option></select
                  ><button class="text-button" (click)="change(u, { role: role.value })">
                    Enregistrer
                  </button>
                </td>
                <td>
                  <span class="badge">{{ u.status === 'ACTIVE' ? 'Actif' : 'Désactivé' }}</span>
                </td>
                <td>
                  <div class="row-actions">
                    <button
                      class="secondary"
                      (click)="change(u, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })"
                    >
                      {{ u.status === 'ACTIVE' ? 'Désactiver' : 'Activer' }}</button
                    ><button class="text-button" (click)="revoke(u)">Révoquer les sessions</button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (!users().length) {
        <p class="empty">{{ loading() ? 'Chargement…' : 'Aucun utilisateur à afficher.' }}</p>
      }
      <div class="pagination">
        <span>{{ total() }} utilisateurs · page {{ page() }}</span>
        <div>
          <button class="secondary" [disabled]="page() === 1" (click)="turn(-1)">← Précédent</button
          ><button class="secondary" [disabled]="page() * 20 >= total()" (click)="turn(1)">
            Suivant →
          </button>
        </div>
      </div>
    </section>`,
})
export class UsersPage {
  private http = inject(HttpClient);
  private notice = inject(Notice);
  private auth = inject(Auth);
  users = signal<User[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(true);
  constructor() {
    this.load();
  }
  load() {
    this.http.get<Page<User>>('/api/v1/users', { params: { page: this.page() } }).subscribe({
      next: (p) => {
        this.users.set(p.items);
        this.total.set(p.total);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notice.error(e);
      },
    });
  }
  turn(delta: number) {
    this.page.update((p) => p + delta);
    this.load();
  }
  change(u: User, body: unknown) {
    if (
      !confirm(
        `Modifier le compte de ${u.displayName} ? Un changement de rôle ou une désactivation ferme ses sessions. Une désactivation ou un passage au rôle client libère ses tickets.`,
      )
    )
      return;
    this.http.patch(`/api/v1/users/${u.id}`, body).subscribe({
      next: () => {
        this.notice.success('Compte mis à jour.');
        if (u.id === this.auth.user()?.id) this.auth.fail();
        else this.load();
      },
      error: (e) => this.notice.error(e),
    });
  }
  revoke(u: User) {
    if (confirm(`Fermer toutes les sessions de ${u.displayName} ?`))
      this.http.delete(`/api/v1/users/${u.id}/sessions`).subscribe({
        next: () => {
          this.notice.success('Sessions révoquées.');
          if (u.id === this.auth.user()?.id) this.auth.fail();
        },
        error: (e) => this.notice.error(e),
      });
  }
}
@Component({
  standalone: true,
  imports: [DatePipe],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">ADMINISTRATION</span>
        <h1>Journal d’audit</h1>
        <p class="muted">Une trace des actions qui comptent pour la sécurité.</p>
      </div>
    </div>
    <section class="panel">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Événement</th>
              <th>Cible</th>
              <th>Acteur</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr>
                <td>
                  <strong>{{ e.action }}</strong>
                </td>
                <td>
                  {{ e.targetType
                  }}<small class="ticket-ref">{{ e.targetId?.slice(0, 8) || '—' }}</small>
                </td>
                <td>{{ e.actorId?.slice(0, 8) || 'Anonyme' }}</td>
                <td>{{ e.createdAt | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (!events().length) {
        <p class="empty">Aucun événement à afficher.</p>
      }
      <div class="pagination">
        <span>{{ total() }} événements · page {{ page() }}</span>
        <div>
          <button class="secondary" [disabled]="page() === 1" (click)="turn(-1)">← Précédent</button
          ><button class="secondary" [disabled]="page() * 20 >= total()" (click)="turn(1)">
            Suivant →
          </button>
        </div>
      </div>
    </section>`,
})
export class AuditPage {
  private http = inject(HttpClient);
  private notice = inject(Notice);
  events = signal<AuditEvent[]>([]);
  total = signal(0);
  page = signal(1);
  constructor() {
    this.load();
  }
  load() {
    this.http.get<Page<AuditEvent>>('/api/v1/audit', { params: { page: this.page() } }).subscribe({
      next: (p) => {
        this.events.set(p.items);
        this.total.set(p.total);
      },
      error: (e) => this.notice.error(e),
    });
  }
  turn(delta: number) {
    this.page.update((p) => p + delta);
    this.load();
  }
}
