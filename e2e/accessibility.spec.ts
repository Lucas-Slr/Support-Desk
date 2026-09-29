import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';

test('Swagger local charge le contrat et ses opérations', async ({ page }) => {
  await page.goto('http://127.0.0.1:3100/api/docs/');
  await expect(page.getByRole('heading', { name: /Support Desk API/ })).toBeVisible();
  await expect(
    page.locator('.opblock-summary-path').filter({ hasText: '/tickets/{id}/messages' }),
  ).toBeVisible();
});

test('accessibilité WCAG des formulaires et du tableau de bord', async ({ page }) => {
  const local = existsSync('apps/api/.env') ? parse(readFileSync('apps/api/.env')) : {};
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  const check = async () => {
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  };
  await check();
  await page.getByLabel('Adresse email').fill('client@support.local');
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill(process.env.DEMO_PASSWORD ?? local.DEMO_PASSWORD!);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    page.getByRole('link', { name: 'Impossible d’accéder à mon espace', exact: true }),
  ).toBeVisible();
  await check();
  await page.setViewportSize({ width: 390, height: 844 });
  await check();
});
