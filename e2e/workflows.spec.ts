import { test, expect, type Page } from '@playwright/test';
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
const config = existsSync('apps/api/.env') ? parse(readFileSync('apps/api/.env')) : {};
const password = process.env.DEMO_PASSWORD ?? config.DEMO_PASSWORD!;
async function login(page: Page, email: string, pass = password) {
  await page.goto('/login');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test('client → agent → note interne → résolution → fermeture', async ({ browser }) => {
  const customerContext = await browser.newContext(),
    agentContext = await browser.newContext();
  const customer = await customerContext.newPage(),
    agent = await agentContext.newPage();
  const email = `e2e-${Date.now()}@example.fr`;
  await customer.goto('/register');
  await customer.getByLabel('Nom affiché').fill('Camille E2E');
  await customer.getByLabel('Adresse email').fill(email);
  await customer.getByLabel('Mot de passe', { exact: true }).fill(password);
  await customer.getByLabel('Confirmer le mot de passe').fill(password);
  await customer.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(customer).toHaveURL(/dashboard/);
  await customer.getByRole('link', { name: 'Nouveau ticket' }).click();
  const subject = `Connexion espace E2E ${Date.now()}`;
  await customer.getByLabel('Sujet').fill(subject);
  await customer.getByLabel('Description').fill('Je ne peux pas accéder au dossier de mon compte.');
  await customer.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(customer.getByRole('heading', { name: subject })).toBeVisible();
  const ticketUrl = customer.url();
  await expect(customer.getByRole('button', { name: 'Prendre en charge' })).toHaveCount(0);
  await expect(customer.getByText('Note interne — équipe uniquement')).toHaveCount(0);
  await login(agent, 'agent@support.local');
  await agent.goto(ticketUrl);
  await agent.getByRole('button', { name: 'Prendre en charge' }).click();
  await expect(agent.getByLabel('Votre réponse')).toBeVisible();
  await agent.getByLabel('Votre réponse').fill('Bonjour Camille, nous vérifions votre accès.');
  await agent.getByRole('button', { name: 'Envoyer la réponse' }).click();
  await expect(agent.getByText('Bonjour Camille, nous vérifions votre accès.')).toBeVisible();
  await agent.getByLabel('Visibilité').selectOption('INTERNAL');
  await agent
    .getByLabel('Note interne', { exact: true })
    .fill('Note confidentielle E2E réservée au support');
  await agent.getByRole('button', { name: 'Ajouter la note interne' }).click();
  await expect(agent.locator('.message.internal')).toContainText('Note confidentielle E2E');
  await customer.reload();
  await expect(customer.getByText('Bonjour Camille, nous vérifions votre accès.')).toBeVisible();
  await expect(customer.getByText('Note confidentielle E2E')).toHaveCount(0);
  const wire = await customer.evaluate(async () => {
    const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    const data = (await r.json()) as { accessToken: string };
    const ticket = await fetch('/api/v1/tickets/' + location.pathname.split('/').pop(), {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    return ticket.text();
  });
  expect(wire).not.toContain('Note confidentielle E2E');
  expect(wire).not.toContain('INTERNAL');
  await agent.getByLabel('Nouveau statut').selectOption('RESOLVED');
  await agent.getByRole('button', { name: 'Mettre à jour le statut' }).click();
  await expect(agent.locator('.page-heading .badge')).toContainText('Résolu');
  await customer.reload();
  customer.once('dialog', (dialog) => dialog.accept());
  await customer.getByRole('button', { name: 'Mettre à jour le statut' }).click();
  await expect(customer.locator('.page-heading .badge')).toContainText('Fermé');
  await customer.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(customer).toHaveURL(/login/);
  await login(customer, email);
  await customer.goto(ticketUrl);
  await expect(customer.getByRole('heading', { name: subject })).toBeVisible();
  await customerContext.close();
  await agentContext.close();
});
test('administration, rôle et révocation de session', async ({ page, browser }) => {
  await login(page, 'admin@support.local');
  await page.getByRole('link', { name: 'Utilisateurs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();
  const email = `role-${Date.now()}@example.fr`;
  const context = await browser.newContext();
  const customer = await context.newPage();
  await customer.goto('/register');
  await customer.getByLabel('Nom affiché').fill('Rôle E2E');
  await customer.getByLabel('Adresse email').fill(email);
  await customer.getByLabel('Mot de passe', { exact: true }).fill(password);
  await customer.getByLabel('Confirmer le mot de passe').fill(password);
  await customer.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(customer).toHaveURL(/dashboard/);
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('combobox').selectOption('AGENT');
  page.once('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('status')).toContainText('Compte mis à jour');
  await customer.reload();
  await expect(customer).toHaveURL(/login/);
  await login(customer, email);
  await customer.getByRole('link', { name: 'Sessions', exact: true }).click();
  customer.once('dialog', (dialog) => dialog.accept());
  await customer.getByRole('button', { name: 'Révoquer', exact: true }).click();
  await expect(customer).toHaveURL(/login/);
  await context.close();
  await page.getByRole('link', { name: 'Journal d’audit' }).click();
  await expect(
    page.getByRole('cell', { name: 'USER_ROLE_CHANGED', exact: true }).first(),
  ).toBeVisible();
});
test('propriété, navigation interdite, stockage et responsive', async ({ page }) => {
  await login(page, 'client@support.local');
  await expect(page.getByRole('link', { name: 'Utilisateurs', exact: true })).toHaveCount(0);
  await page.goto('/users');
  await expect(page).toHaveURL(/dashboard/);
  const checks = await page.evaluate(async () => {
    const renewed = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    const { accessToken } = (await renewed.json()) as { accessToken: string };
    const r = await fetch('/api/v1/users', { headers: { Authorization: `Bearer ${accessToken}` } });
    return {
      status: r.status,
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
    };
  });
  expect(checks.status).toBe(403);
  expect(checks.local).toEqual([]);
  expect(checks.session).toEqual([]);
  expect(checks.cookie).not.toContain('sd_refresh');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.local/dashboard.png', fullPage: true });
});
