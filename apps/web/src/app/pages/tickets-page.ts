import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import type { Page, Ticket } from '@support-desk/contracts';
import { Auth, Notice } from '../core/auth';
import { statusLabels, priorityLabels } from '../core/labels';
@Component({
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DatePipe],
  template: `
    <div class="page-heading">
      <div>
        <span class="eyebrow">{{
          dashboard ? 'VOTRE ESPACE, EN UN COUP D’ŒIL' : 'CENTRE D’ASSISTANCE'
        }}</span>
        <h1>
          {{
            dashboard
              ? 'Bonjour, ' + auth.user()?.displayName?.split(' ')?.[0] + '.'
              : 'Vos tickets'
          }}
        </h1>
        <p class="muted">
          {{
            dashboard
              ? 'Gardez le fil de vos demandes et avançons ensemble.'
              : 'Chaque demande mérite une réponse. Retrouvez-les ici.'
          }}
        </p>
      </div>
      @if (auth.user()?.role === 'CUSTOMER') {
        <a class="primary" routerLink="/tickets/new"><span>＋</span> Nouveau ticket</a>
      }
    </div>
    @if (dashboard) {
      <div class="stats-grid">
        <article class="stat">
          <span>Tickets accessibles</span><strong>{{ total() }}</strong
          ><small>Dans votre espace</small><span class="stat-icon">▤</span>
        </article>
        <article class="stat">
          <span>En cours</span><strong>{{ inProgress() }}</strong
          ><small>Votre équipe s’en occupe</small><span class="stat-icon">↗</span>
        </article>
        <article class="stat">
          <span>En attente</span><strong>{{ waiting() }}</strong
          ><small>Une réponse attendue</small><span class="stat-icon">◷</span>
        </article>
        <article class="stat">
          <span>Résolus</span><strong>{{ resolved() }}</strong
          ><small>Un pas de plus</small><span class="stat-icon">✓</span>
        </article>
      </div>
      <section class="welcome-strip">
        <div>
          <span class="eyebrow">ON EST LÀ POUR VOUS</span>
          <h2>Un souci ? Parlons-en.</h2>
          <p>Décrivez votre demande, suivez les échanges et retrouvez toutes vos réponses.</p>
        </div>
        <span class="strip-art" aria-hidden="true">↗</span>
      </section>
    }
    <section class="panel">
      <div class="panel-heading">
        <h2>
          {{ dashboard ? 'Dernières demandes' : 'Toutes les demandes' }}
          <span class="count">{{ total() }}</span>
        </h2>
        <span class="muted small">Mise à jour à chaque consultation</span>
      </div>
      <form class="filters" [formGroup]="form" (ngSubmit)="page.set(1); load()">
        <label class="search"
          ><span class="sr-only">Rechercher</span
          ><input formControlName="q" placeholder="Rechercher un ticket…" /></label
        ><label
          ><span class="sr-only">Statut</span
          ><select formControlName="status">
            <option value="">Tous les statuts</option>
            @for (s of statuses; track s) {
              <option [value]="s">{{ labels[s] }}</option>
            }
          </select></label
        ><label
          ><span class="sr-only">Priorité</span
          ><select formControlName="priority">
            <option value="">Toutes les priorités</option>
            @for (p of priorities; track p) {
              <option [value]="p">{{ priorityNames[p] }}</option>
            }
          </select></label
        >
        @if (auth.user()?.role !== 'CUSTOMER') {
          <label
            ><span class="sr-only">Attribution</span
            ><select formControlName="assignment">
              <option value="all">Toutes les attributions</option>
              <option value="mine">Mes tickets attribués</option>
              <option value="unassigned">Non attribués</option>
            </select></label
          >
        }
        <button class="secondary">Filtrer</button>
      </form>
      @if (loading()) {
        <p class="empty" role="status">Chargement des demandes…</p>
      } @else if (tickets().length === 0) {
        <div class="empty">
          <span class="empty-icon">▤</span>
          <h3>Rien à afficher pour le moment.</h3>
          <p>Vos demandes apparaîtront ici. Essayez aussi d’ajuster les filtres.</p>
        </div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Demande</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th>Créée le</th>
                <th><span class="sr-only">Détail</span></th>
              </tr>
            </thead>
            <tbody>
              @for (t of tickets(); track t.id) {
                <tr>
                  <td>
                    <a class="ticket-title" [routerLink]="['/tickets', t.id]">{{ t.subject }}</a
                    ><small class="ticket-ref"
                      >#{{ t.id.slice(0, 8) }} ·
                      {{ t.assignedAgentId ? 'Attribué' : 'À attribuer' }}</small
                    >
                  </td>
                  <td>
                    <span [class]="'badge status-' + t.status"
                      ><span>●</span> {{ labels[t.status] }}</span
                    >
                  </td>
                  <td>
                    <span [class]="'priority priority-' + t.priority">{{
                      priorityNames[t.priority]
                    }}</span>
                  </td>
                  <td class="muted">{{ t.createdAt | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    <a [routerLink]="['/tickets', t.id]" [attr.aria-label]="'Ouvrir ' + t.subject"
                      >↗</a
                    >
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      <div class="pagination">
        <span>{{ total() }} demande(s) · page {{ page() }}</span>
        <div>
          <button class="secondary" [disabled]="page() === 1 || loading()" (click)="changePage(-1)">
            ← Précédent</button
          ><button
            class="secondary"
            [disabled]="page() * 10 >= total() || loading()"
            (click)="changePage(1)"
          >
            Suivant →
          </button>
        </div>
      </div>
    </section>
  `,
})
export class TicketsPage {
  auth = inject(Auth);
  private http = inject(HttpClient);
  private notice = inject(Notice);
  dashboard = inject(ActivatedRoute).snapshot.data['dashboard'] === true;
  tickets = signal<Ticket[]>([]);
  total = signal(0);
  inProgress = signal(0);
  waiting = signal(0);
  resolved = signal(0);
  page = signal(1);
  loading = signal(false);
  labels = statusLabels;
  priorityNames = priorityLabels;
  statuses = Object.keys(statusLabels);
  priorities = Object.keys(priorityLabels);
  form = inject(FormBuilder).nonNullable.group({
    q: [''],
    status: [''],
    priority: [''],
    assignment: ['all'],
  });
  constructor() {
    this.load();
    if (this.dashboard) {
      for (const [status, target] of [
        ['IN_PROGRESS', this.inProgress],
        ['WAITING_FOR_CUSTOMER', this.waiting],
        ['RESOLVED', this.resolved],
      ] as const)
        this.http
          .get<Page<Ticket>>('/api/v1/tickets', { params: { status, pageSize: 1 } })
          .subscribe({ next: (p) => target.set(p.total), error: (e) => this.notice.error(e) });
    }
  }
  load() {
    this.loading.set(true);
    let params = new HttpParams().set('page', this.page()).set('pageSize', 10);
    for (const [key, value] of Object.entries(this.form.getRawValue()))
      if (value) params = params.set(key, value);
    this.http
      .get<Page<Ticket>>('/api/v1/tickets', { params })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (p) => {
          this.tickets.set(p.items);
          this.total.set(p.total);
        },
        error: (e) => this.notice.error(e),
      });
  }
  changePage(delta: number) {
    this.page.update((p) => p + delta);
    this.load();
  }
}
