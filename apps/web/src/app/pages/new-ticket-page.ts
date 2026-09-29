import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import type { Ticket } from '@support-desk/contracts';
import { Notice } from '../core/auth';
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `<a class="back-link" routerLink="/tickets">← Retour aux tickets</a>
    <div class="page-heading">
      <div>
        <span class="eyebrow">UNE NOUVELLE CONVERSATION</span>
        <h1>Comment vous aider ?</h1>
        <p class="muted">Un peu de contexte nous aide à vous répondre plus vite.</p>
      </div>
    </div>
    <form class="panel editor" [formGroup]="form" (ngSubmit)="submit()">
      <label
        >Sujet<input
          formControlName="subject"
          maxlength="160"
          placeholder="Résumez votre demande en quelques mots" /></label
      ><label
        >Description<textarea
          formControlName="description"
          rows="8"
          maxlength="10000"
          placeholder="Que se passe-t-il ? Qu’avez-vous déjà essayé ?"
        ></textarea>
      </label>
      <p class="field-help">N’incluez aucun mot de passe ni donnée confidentielle.</p>
      @if (invalid()) {
        <p class="form-error" role="alert">
          Le sujet doit contenir au moins 5 caractères et la description au moins 10.
        </p>
      }
      <div class="form-actions">
        <a class="secondary" routerLink="/tickets">Annuler</a
        ><button class="primary" [disabled]="busy()">
          {{ busy() ? 'Envoi…' : 'Envoyer la demande' }} →
        </button>
      </div>
    </form>`,
})
export class NewTicketPage {
  private http = inject(HttpClient);
  private router = inject(Router);
  private notice = inject(Notice);
  busy = signal(false);
  invalid = signal(false);
  form = inject(FormBuilder).nonNullable.group({
    subject: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(160)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(10000)]],
  });
  submit() {
    this.invalid.set(this.form.invalid);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.http
      .post<Ticket>('/api/v1/tickets', this.form.getRawValue())
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (t) => {
          this.notice.success('Votre demande a été créée.');
          void this.router.navigate(['/tickets', t.id]);
        },
        error: (e) => this.notice.error(e),
      });
  }
}
