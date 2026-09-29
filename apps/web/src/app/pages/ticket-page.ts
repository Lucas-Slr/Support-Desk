import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import type { Ticket, TicketStatus, Page, User } from '@support-desk/contracts';
import { Auth, Notice } from '../core/auth';
import { priorityLabels, statusLabels } from '../core/labels';
@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, ReactiveFormsModule],
  template: `
    <a class="back-link" routerLink="/tickets">← Toutes les demandes</a>
    @if (ticket(); as t) {
      <div class="page-heading">
        <div>
          <span class="eyebrow">DEMANDE #{{ t.id.slice(0, 8) }}</span>
          <h1>{{ t.subject }}</h1>
          <p class="muted">Créée le {{ t.createdAt | date: 'dd/MM/yyyy à HH:mm' }}</p>
        </div>
        <span [class]="'badge status-' + t.status">● {{ labels[t.status] }}</span>
      </div>
      <div class="detail-grid">
        <section>
          <article class="panel original-message">
            <span class="eyebrow">LA DEMANDE INITIALE</span>
            <p class="message-content">{{ t.description }}</p>
          </article>
          <h2 class="conversation-title">
            Conversation <span class="count">{{ t.messages?.length ?? 0 }}</span>
          </h2>
          @for (message of t.messages; track message.id) {
            <article [class]="'message ' + (message.visibility === 'INTERNAL' ? 'internal' : '')">
              <div class="message-meta">
                <strong>{{ message.authorId === auth.user()?.id ? 'Vous' : 'Participant' }}</strong
                ><span>{{ message.createdAt | date: 'dd/MM à HH:mm' }}</span>
                @if (message.visibility === 'INTERNAL') {
                  <span class="badge note">▣ Note interne · équipe uniquement</span>
                } @else {
                  <span class="muted">Message public</span>
                }
              </div>
              <p class="message-content">{{ message.content }}</p>
            </article>
          }
          @if (canReply()) {
            <form class="panel editor" [formGroup]="reply" (ngSubmit)="send()">
              <h3>Continuer la conversation</h3>
              @if (manage()) {
                <label
                  >Visibilité<select formControlName="visibility">
                    <option value="PUBLIC">Réponse publique — visible par le client</option>
                    <option value="INTERNAL">Note interne — équipe uniquement</option>
                  </select></label
                >
              }
              <label
                >{{
                  reply.controls.visibility.value === 'INTERNAL' ? 'Note interne' : 'Votre réponse'
                }}<textarea formControlName="content" rows="4" maxlength="10000"></textarea></label
              ><button class="primary" [disabled]="busy() || reply.invalid">
                {{
                  reply.controls.visibility.value === 'INTERNAL'
                    ? 'Ajouter la note interne'
                    : 'Envoyer la réponse'
                }}
                →
              </button>
            </form>
          } @else {
            <p class="empty panel">
              {{
                t.status === 'CLOSED' || t.status === 'RESOLVED'
                  ? 'Cette conversation est terminée.'
                  : 'Prenez en charge le ticket pour y répondre.'
              }}
            </p>
          }
        </section>
        <aside class="panel ticket-properties">
          <h2>Détails du ticket</h2>
          <dl>
            <dt>Priorité</dt>
            <dd [class]="'priority priority-' + t.priority">{{ priorityNames[t.priority] }}</dd>
            <dt>Attribution</dt>
            <dd>
              {{
                t.assignedAgentId === auth.user()?.id
                  ? 'Vous'
                  : t.assignedAgentId
                    ? 'Attribué à un agent'
                    : 'Non attribué'
              }}
            </dd>
            <dt>Dernière mise à jour</dt>
            <dd>{{ t.updatedAt | date: 'dd/MM/yyyy HH:mm' }}</dd>
          </dl>
          @if (auth.user()?.role !== 'CUSTOMER' && !t.assignedAgentId && t.status !== 'CLOSED') {
            <button class="primary full" [disabled]="busy()" (click)="action('claim', {})">
              Prendre en charge
            </button>
          }
          @if (manage() && t.status !== 'CLOSED') {
            <label
              >Changer la priorité<select #priority [value]="t.priority">
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Normale</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select></label
            ><button
              class="secondary full"
              [disabled]="busy()"
              (click)="action('priority', { priority: priority.value })"
            >
              Appliquer la priorité
            </button>
          }
          @if (nextStatuses().length) {
            <label
              >Nouveau statut<select #status>
                @for (s of nextStatuses(); track s) {
                  <option [value]="s">{{ labels[s] }}</option>
                }
              </select></label
            ><button
              class="secondary full"
              [disabled]="busy()"
              (click)="changeStatus(status.value)"
            >
              Mettre à jour le statut
            </button>
          }
          @if (auth.user()?.role === 'ADMIN') {
            <label
              >Réattribuer<select #assignee>
                <option value="">Non attribué</option>
                @for (u of agents(); track u.id) {
                  <option [value]="u.id">{{ u.displayName }}</option>
                }
              </select></label
            ><button class="secondary full" [disabled]="busy()" (click)="assign(assignee.value)">
              Réattribuer
            </button>
          }
        </aside>
      </div>
    } @else {
      <p class="empty" role="status">
        {{ failed() ? 'Ce ticket est indisponible.' : 'Chargement du ticket…' }}
      </p>
    }
  `,
})
export class TicketPage {
  auth = inject(Auth);
  private http = inject(HttpClient);
  private notice = inject(Notice);
  private id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  ticket = signal<Ticket | null>(null);
  busy = signal(false);
  failed = signal(false);
  agents = signal<User[]>([]);
  labels = statusLabels;
  priorityNames = priorityLabels;
  manage = computed(
    () =>
      this.auth.user()?.role === 'ADMIN' ||
      (this.auth.user()?.role === 'AGENT' &&
        this.ticket()?.assignedAgentId === this.auth.user()?.id),
  );
  canReply = computed(
    () =>
      !!this.ticket() &&
      !['RESOLVED', 'CLOSED'].includes(this.ticket()!.status) &&
      (this.auth.user()?.role === 'CUSTOMER' || this.manage()),
  );
  nextStatuses = computed(() => {
    const t = this.ticket();
    if (!t) return [];
    if (this.auth.user()?.role === 'CUSTOMER') return t.status === 'RESOLVED' ? ['CLOSED'] : [];
    if (!this.manage()) return [];
    const transitions: Record<TicketStatus, string[]> = {
      OPEN: ['IN_PROGRESS'],
      IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
      WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
      RESOLVED: ['IN_PROGRESS', 'CLOSED'],
      CLOSED: [],
    };
    return transitions[t.status];
  });
  reply = inject(FormBuilder).nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(10000)]],
    visibility: ['PUBLIC'],
  });
  constructor() {
    this.load();
    if (this.auth.user()?.role === 'ADMIN') this.loadAgents(1);
  }
  private loadAgents(page: number) {
    this.http.get<Page<User>>('/api/v1/users', { params: { page, pageSize: 100 } }).subscribe({
      next: (p) => {
        this.agents.update((a) => [
          ...a,
          ...p.items.filter((u) => u.role !== 'CUSTOMER' && u.status === 'ACTIVE'),
        ]);
        if (page * 100 < p.total) this.loadAgents(page + 1);
      },
      error: (e) => this.notice.error(e),
    });
  }
  load() {
    this.http.get<Ticket>(`/api/v1/tickets/${this.id}`).subscribe({
      next: (t) => this.ticket.set(t),
      error: (e) => {
        this.failed.set(true);
        this.notice.error(e);
      },
    });
  }
  action(endpoint: string, body: unknown) {
    this.busy.set(true);
    const url = `/api/v1/tickets/${this.id}/${endpoint}`;
    const request = ['claim', 'messages'].includes(endpoint)
      ? this.http.post(url, body)
      : this.http.patch(url, body);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.reply.controls.content.reset();
        this.load();
        this.notice.success('Le ticket a été mis à jour.');
      },
      error: (e) => this.notice.error(e),
    });
  }
  send() {
    if (this.reply.valid) this.action('messages', this.reply.getRawValue());
  }
  changeStatus(status: string) {
    if (
      status === 'CLOSED' &&
      !confirm('Fermer ce ticket ? Il ne pourra plus recevoir de messages ni être rouvert.')
    )
      return;
    this.action('status', { status });
  }
  assign(id: string) {
    if (confirm('Réattribuer ce ticket ? Les droits d’accès des agents seront modifiés.'))
      this.action('assignment', { assignedAgentId: id || null });
  }
}
