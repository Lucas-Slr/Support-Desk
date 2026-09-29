import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthPage } from './auth-page';
describe('Formulaires de compte', () => {
  it('refuse une inscription avec une confirmation différente', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { register: true } } } },
      ],
    });
    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentInstance.form.setValue({
      email: 'camille@example.fr',
      displayName: 'Camille',
      password: 'une longue phrase',
      confirmation: 'autre phrase',
    });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toContain('confirmation');
    TestBed.inject(HttpTestingController).expectNone('/api/v1/auth/register');
  });
  it('refuse un email invalide à la connexion', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
      ],
    });
    const fixture = TestBed.createComponent(AuthPage);
    fixture.componentInstance.form.patchValue({ email: 'invalide', password: 'pass' });
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.error()).toBeTruthy();
    TestBed.inject(HttpTestingController).expectNone('/api/v1/auth/login');
  });
});
