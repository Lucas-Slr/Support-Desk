import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth, Notice } from './core/auth';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <a class="skip" href="#main">Aller au contenu</a>
    @if (auth.user(); as user) {
      <div class="workspace">
        <aside class="sidebar">
          <a class="brand" routerLink="/dashboard"
            ><span class="brand-mark">s.</span>support desk<span class="brand-dot">●</span></a
          >
          <p class="nav-caption">ESPACE DE TRAVAIL</p>
          <nav aria-label="Navigation principale">
            <a routerLink="/dashboard" routerLinkActive="active"
              ><span aria-hidden="true">◫</span> Vue d’ensemble</a
            ><a routerLink="/tickets" routerLinkActive="active"
              ><span aria-hidden="true">▤</span> Tickets</a
            >
            @if (user.role === 'ADMIN') {
              <p class="nav-caption">ADMINISTRATION</p>
              <a routerLink="/users" routerLinkActive="active"
                ><span aria-hidden="true">♧</span> Utilisateurs</a
              ><a routerLink="/audit" routerLinkActive="active"
                ><span aria-hidden="true">≡</span> Journal d’audit</a
              >
            }
            <p class="nav-caption">MON COMPTE</p>
            <a routerLink="/profile" routerLinkActive="active"
              ><span aria-hidden="true">○</span> Profil</a
            ><a routerLink="/sessions" routerLinkActive="active"
              ><span aria-hidden="true">▣</span> Sessions</a
            >
          </nav>
          <div class="sidebar-bottom">
            <div class="security-label"><span class="online"></span> Espace sécurisé</div>
            <p>Une demande, une conversation,<br />une solution.</p>
            <div class="user-card">
              <span class="avatar">{{ user.displayName.slice(0, 2).toUpperCase() }}</span>
              <div>
                <strong>{{ user.displayName }}</strong
                ><small>{{ roleLabel(user.role) }}</small>
              </div>
              <button
                class="icon-button"
                title="Se déconnecter"
                aria-label="Se déconnecter"
                (click)="logout()"
              >
                ↗
              </button>
            </div>
          </div>
        </aside>
        <div class="main-shell">
          <header class="topbar">
            <span>Centre d’assistance <span class="muted">/ Votre espace</span></span
            ><span class="top-status"><span class="online"></span> À votre écoute</span>
          </header>
          <main id="main"><router-outlet /></main>
          <footer>Support Desk <span>Un support plus humain.</span></footer>
        </div>
      </div>
    } @else {
      <main id="main"><router-outlet /></main>
    }
    @if (notice.text()) {
      <div class="toast" role="status" aria-live="polite">
        {{ notice.text()
        }}<button aria-label="Fermer la notification" (click)="notice.text.set('')">×</button>
      </div>
    }
  `,
})
export class App {
  auth = inject(Auth);
  notice = inject(Notice);
  roleLabel(role: string) {
    return (
      { CUSTOMER: 'Client', AGENT: 'Agent de support', ADMIN: 'Administrateur' } as Record<
        string,
        string
      >
    )[role];
  }
  logout() {
    this.auth.logout().subscribe({ error: (e) => this.notice.error(e) });
  }
}
