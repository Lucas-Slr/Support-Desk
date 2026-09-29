import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import type { Session } from '@support-desk/contracts';
import { Auth, Notice } from '../core/auth';
@Component({
  standalone: true,
  imports: [DatePipe],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">MON COMPTE</span>
        <h1>Votre profil</h1>
        <p class="muted">Les informations de votre espace personnel.</p>
      </div>
    </div>
    @if (auth.user(); as u) {
      <section class="panel editor">
        <div class="profile-avatar avatar">{{ u.displayName.slice(0, 2).toUpperCase() }}</div>
        <h2>{{ u.displayName }}</h2>
        <dl>
          <dt>Email</dt>
          <dd>{{ u.email }}</dd>
          <dt>Rôle</dt>
          <dd>{{ u.role }}</dd>
          <dt>Membre depuis</dt>
          <dd>{{ u.createdAt | date: 'dd/MM/yyyy' }}</dd>
        </dl>
        <p class="field-help">Les rôles sont attribués par un administrateur.</p>
      </section>
    }`,
})
export class ProfilePage {
  auth = inject(Auth);
}
@Component({
  standalone: true,
  imports: [DatePipe],
  template: `<div class="page-heading">
      <div>
        <span class="eyebrow">SÉCURITÉ DU COMPTE</span>
        <h1>Vos sessions</h1>
        <p class="muted">Gardez le contrôle des appareils connectés à votre compte.</p>
      </div>
      <button class="danger" (click)="logoutAll()">Fermer toutes les sessions</button>
    </div>
    <section class="panel">
      @if (loading()) {
        <p class="empty">Chargement…</p>
      }
      @for (s of sessions(); track s.id) {
        <article class="session-row">
          <span class="session-icon">▣</span>
          <div>
            <h3>
              {{ s.current ? 'Cet appareil' : 'Autre appareil' }}
              @if (s.current) {
                <span class="badge status-RESOLVED">Session actuelle</span>
              }
            </h3>
            <p class="user-agent">{{ s.userAgent || 'Navigateur inconnu' }}</p>
            <small class="muted"
              >Dernière activité : {{ s.lastUsedAt | date: 'dd/MM/yyyy HH:mm' }} · Expire le
              {{ s.expiresAt | date: 'dd/MM/yyyy' }}</small
            >
          </div>
          <button class="secondary" (click)="revoke(s)">Révoquer</button>
        </article>
      }
    </section>`,
})
export class SessionsPage {
  private http = inject(HttpClient);
  private auth = inject(Auth);
  private notice = inject(Notice);
  sessions = signal<Session[]>([]);
  loading = signal(true);
  constructor() {
    this.load();
  }
  load() {
    this.http.get<Session[]>('/api/v1/auth/sessions').subscribe({
      next: (s) => {
        this.sessions.set(s);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.notice.error(e);
      },
    });
  }
  revoke(session: Session) {
    if (!confirm('Révoquer cette session ? Cet appareil devra se reconnecter.')) return;
    this.http.delete(`/api/v1/auth/sessions/${session.id}`).subscribe({
      next: () => {
        if (session.current) this.auth.fail();
        else this.load();
        this.notice.success('Session révoquée.');
      },
      error: (e) => this.notice.error(e),
    });
  }
  logoutAll() {
    if (confirm('Fermer toutes vos sessions, y compris celle-ci ?'))
      this.auth.logout(true).subscribe({ error: (e) => this.notice.error(e) });
  }
}
