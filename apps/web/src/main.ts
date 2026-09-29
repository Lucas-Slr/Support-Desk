import { inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { App } from './app/app';
import { Auth, authInterceptor, signedIn, guestOnly, allowedRoles } from './app/core/auth';
void bootstrapApplication(App, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(() => inject(Auth).initialize()),
    provideRouter([
      {
        path: 'login',
        canActivate: [guestOnly],
        loadComponent: () => import('./app/pages/auth-page').then((m) => m.AuthPage),
      },
      {
        path: 'register',
        canActivate: [guestOnly],
        data: { register: true },
        loadComponent: () => import('./app/pages/auth-page').then((m) => m.AuthPage),
      },
      {
        path: 'dashboard',
        canActivate: [signedIn],
        data: { dashboard: true },
        loadComponent: () => import('./app/pages/tickets-page').then((m) => m.TicketsPage),
      },
      {
        path: 'tickets/new',
        canActivate: [signedIn, allowedRoles('CUSTOMER')],
        loadComponent: () => import('./app/pages/new-ticket-page').then((m) => m.NewTicketPage),
      },
      {
        path: 'tickets',
        canActivate: [signedIn],
        loadComponent: () => import('./app/pages/tickets-page').then((m) => m.TicketsPage),
      },
      {
        path: 'tickets/:id',
        canActivate: [signedIn],
        loadComponent: () => import('./app/pages/ticket-page').then((m) => m.TicketPage),
      },
      {
        path: 'profile',
        canActivate: [signedIn],
        loadComponent: () => import('./app/pages/account-pages').then((m) => m.ProfilePage),
      },
      {
        path: 'sessions',
        canActivate: [signedIn],
        loadComponent: () => import('./app/pages/account-pages').then((m) => m.SessionsPage),
      },
      {
        path: 'users',
        canActivate: [signedIn, allowedRoles('ADMIN')],
        loadComponent: () => import('./app/pages/admin-pages').then((m) => m.UsersPage),
      },
      {
        path: 'audit',
        canActivate: [signedIn, allowedRoles('ADMIN')],
        loadComponent: () => import('./app/pages/admin-pages').then((m) => m.AuditPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: '**', redirectTo: 'dashboard' },
    ]),
  ],
});
