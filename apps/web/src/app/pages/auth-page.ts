import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { Auth, safeError } from '../core/auth';
@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="auth-layout">
      <section class="auth-story">
        <a class="brand" routerLink="/login"><span class="brand-mark">s.</span>support desk</a>
        <div>
          <span class="eyebrow">LE SUPPORT, SIMPLEMENT.</span>
          <h1>Les bonnes réponses<br />commencent par<br />une conversation.</h1>
          <p>Un espace pour vos demandes.<br />Une équipe pour vous accompagner.</p>
          <div class="story-art" aria-hidden="true">
            <div class="art-line"></div>
            <span class="art-card">Bonjour, comment pouvons-nous vous aider ? <b>↗</b></span
            ><span class="art-reply">Ensemble, trouvons une solution. <b>✓</b></span>
          </div>
        </div>
        <small>Clarté. Confiance. Accompagnement.</small>
      </section>
      <section class="auth-form">
        <div class="form-wrap">
          <span class="eyebrow">BIENVENUE SUR SUPPORT DESK</span>
          <h2>{{ register ? 'Créons votre espace.' : 'Heureux de vous retrouver.' }}</h2>
          <p class="muted">
            {{
              register
                ? 'Quelques informations pour mieux vous accompagner.'
                : 'Connectez-vous pour suivre vos demandes.'
            }}
          </p>
          <form [formGroup]="form" (ngSubmit)="submit()">
            @if (register) {
              <label
                >Nom affiché<input
                  formControlName="displayName"
                  autocomplete="name"
                  maxlength="80"
                  placeholder="Camille Martin"
              /></label>
            }
            <label
              >Adresse email<input
                type="email"
                formControlName="email"
                autocomplete="email"
                placeholder="vous@exemple.fr"
            /></label>
            <label
              >Mot de passe<input
                type="password"
                formControlName="password"
                [autocomplete]="register ? 'new-password' : 'current-password'"
                maxlength="128"
            /></label>
            @if (register) {
              <p class="field-help">12 à 128 caractères. Une phrase de passe est bienvenue.</p>
              <label
                >Confirmer le mot de passe<input
                  type="password"
                  formControlName="confirmation"
                  autocomplete="new-password"
              /></label>
            }
            @if (error()) {
              <p class="form-error" role="alert">{{ error() }}</p>
            }
            <button class="primary full" [disabled]="busy()">
              {{ busy() ? 'Un instant…' : register ? 'Créer mon compte' : 'Se connecter' }}
              <span>→</span>
            </button>
          </form>
          <p class="auth-switch">
            {{ register ? 'Déjà un compte ?' : 'Vous découvrez Support Desk ?' }}
            <a [routerLink]="register ? '/login' : '/register'">{{
              register ? 'Se connecter' : 'Créer un compte'
            }}</a>
          </p>
          <p class="auth-footnote">Vos échanges restent dans votre espace personnel.</p>
        </div>
      </section>
    </div>
  `,
})
export class AuthPage {
  private auth = inject(Auth);
  private router = inject(Router);
  register = inject(ActivatedRoute).snapshot.data['register'] === true;
  busy = signal(false);
  error = signal('');
  form = inject(FormBuilder).nonNullable.group({
    displayName: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
    confirmation: [''],
  });
  submit() {
    this.error.set('');
    const v = this.form.getRawValue();
    if (
      this.form.invalid ||
      (this.register &&
        (v.displayName.trim().length < 2 ||
          v.password.length < 12 ||
          v.password !== v.confirmation))
    ) {
      this.error.set(
        'Vérifiez votre email, votre nom et vos mots de passe. La confirmation doit être identique.',
      );
      return;
    }
    this.busy.set(true);
    const request = this.register
      ? this.auth.register({ email: v.email, password: v.password, displayName: v.displayName })
      : this.auth.login({ email: v.email, password: v.password });
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (e) => this.error.set(safeError(e)),
    });
  }
}
