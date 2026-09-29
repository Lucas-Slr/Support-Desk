import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { db } from '../src/database/client.js';
import { hashPassword } from '../src/modules/auth/service.js';
import { signAccess } from '../src/security/tokens.js';
import { canTransition } from '../src/modules/tickets/policy.js';
const origin = 'http://localhost:4200',
  pass = 'A long testing passphrase';
let app: ReturnType<typeof createApp>;
let passwordHash: string;
type Login = { token: string; cookie: string; id: string; sid: string };
async function user(role: 'CUSTOMER' | 'AGENT' | 'ADMIN' = 'CUSTOMER'): Promise<Login> {
  const email = `${randomUUID()}@test.local`;
  const u = await db.user.create({ data: { email, displayName: 'Test User', passwordHash, role } });
  const r = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ email, password: pass });
  expect(r.status).toBe(200);
  const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  return {
    token: r.body.accessToken as string,
    cookie,
    id: u.id,
    sid: cookie.split('=')[1]!.split('.')[0]!,
  };
}
const get = (url: string, u?: Login) => {
  const r = request(app).get(`/api/v1${url}`);
  return u ? r.auth(u.token, { type: 'bearer' }) : r;
};
async function ticket(u: Login, assignedAgentId: string | null = null) {
  return db.ticket.create({
    data: {
      authorId: u.id,
      subject: 'Ticket confidentiel',
      description: 'Une description de test privée.',
      assignedAgentId,
      status: assignedAgentId ? 'IN_PROGRESS' : 'OPEN',
    },
  });
}
beforeAll(async () => {
  passwordHash = await hashPassword(pass);
});
beforeEach(async () => {
  app = createApp();
  await db.auditEvent.deleteMany();
  await db.ticketMessage.deleteMany();
  await db.ticket.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
});
afterAll(async () => {
  await db.$disconnect();
});
describe('authentification HTTP', () => {
  it('inscrit, normalise, impose CUSTOMER et ne retourne aucun hash', async () => {
    const r = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email: ' CLIENT@EXAMPLE.FR ', password: pass, displayName: 'Camille' });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe('CUSTOMER');
    expect(r.body.user.email).toBe('client@example.fr');
    expect(JSON.stringify(r.body)).not.toContain('passwordHash');
    expect((r.headers['set-cookie'] as unknown as string[])[0]).toContain('HttpOnly');
    expect((r.headers['set-cookie'] as unknown as string[])[0]).toContain('SameSite=Strict');
    const duplicate = await request(app)
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .send({ email: 'client@example.fr', password: pass, displayName: 'Camille' });
    expect(duplicate.status).toBe(409);
  });
  it.each(['ADMIN', 'AGENT'])('refuse un rôle public %s', async (role) => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .set('Origin', origin)
          .send({ email: 'a@b.fr', password: pass, displayName: 'AA', role })
      ).status,
    ).toBe(422);
    expect(await db.user.count()).toBe(0);
  });
  it('refuse mot de passe court et champs inconnus', async () => {
    expect(
      (
        await request(app)
          .post('/api/v1/auth/register')
          .set('Origin', origin)
          .send({ email: 'a@b.fr', password: 'court', displayName: 'AA' })
      ).status,
    ).toBe(422);
  });
  it('répond avec une erreur générique aux identifiants incorrects', async () => {
    const u = await user();
    const existing = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    const a = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: existing.email, password: 'wrong' });
    const b = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'unknown@test.local', password: 'wrong' });
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it('valide le Bearer, refuse les sessions désactivées et les requêtes anonymes', async () => {
    expect((await get('/auth/me')).status).toBe(401);
    const u = await user();
    expect((await get('/auth/me', u)).status).toBe(200);
    await db.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    expect((await get('/auth/me', u)).status).toBe(401);
  });
  it.each(['expired', 'signature', 'issuer', 'audience', 'claims', 'algorithm'])(
    'refuse un JWT : %s',
    async (kind) => {
      const u = await user();
      const key = new TextEncoder().encode(
        kind === 'signature' ? 'wrong-secret-wrong-secret-wrong-secret' : process.env.JWT_SECRET,
      );
      const token = await new SignJWT(kind === 'claims' ? {} : { sid: u.sid })
        .setProtectedHeader({ alg: kind === 'algorithm' ? 'HS384' : 'HS256', typ: 'JWT' })
        .setSubject(u.id)
        .setJti(randomUUID())
        .setIssuedAt()
        .setIssuer(kind === 'issuer' ? 'wrong' : 'support-desk-api')
        .setAudience(kind === 'audience' ? 'wrong' : 'support-desk-web')
        .setExpirationTime(kind === 'expired' ? '0s' : '10m')
        .sign(key);
      expect((await get('/auth/me', { ...u, token })).status).toBe(401);
    },
  );
  it('fait tourner le cookie puis révoque sur réutilisation', async () => {
    const u = await user();
    const first = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', origin)
      .set('Cookie', u.cookie);
    expect(first.status).toBe(200);
    const nextCookie = (first.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(nextCookie).not.toBe(u.cookie);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', u.cookie)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', nextCookie)
      ).status,
    ).toBe(401);
    expect((await get('/auth/me', u)).status).toBe(401);
  });
  it('sérialise deux rotations simultanées et conserve la révocation', async () => {
    const u = await user();
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', u.cookie),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect((await db.session.findUniqueOrThrow({ where: { id: u.sid } })).revokedAt).not.toBeNull();
  });
  it.each(['expired', 'revoked', 'disabled'])('refuse le renouvellement : %s', async (state) => {
    const u = await user();
    if (state === 'disabled')
      await db.user.update({ where: { id: u.id }, data: { status: 'DISABLED' } });
    else
      await db.session.update({
        where: { id: u.sid },
        data: state === 'expired' ? { expiresAt: new Date(0) } : { revokedAt: new Date() },
      });
    expect(
      (
        await request(app)
          .post('/api/v1/auth/refresh')
          .set('Origin', origin)
          .set('Cookie', u.cookie)
      ).status,
    ).toBe(401);
  });
  it('déconnecte la session courante et toutes les sessions', async () => {
    const u = await user();
    const result = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .auth(u.token, { type: 'bearer' });
    expect(result.status).toBe(204);
    expect((await get('/auth/me', u)).status).toBe(401);
    const a = await user();
    await db.session.create({
      data: { userId: a.id, secretHash: 'test-hash', expiresAt: new Date(Date.now() + 100000) },
    });
    expect(
      (
        await request(app)
          .post('/api/v1/auth/logout-all')
          .set('Origin', origin)
          .auth(a.token, { type: 'bearer' })
      ).status,
    ).toBe(204);
    expect(await db.session.count({ where: { userId: a.id, revokedAt: null } })).toBe(0);
  });
  it('protège les cookies des origines étrangères et absentes', async () => {
    for (const source of ['', 'https://evil.example']) {
      const r = request(app).post('/api/v1/auth/refresh');
      if (source) r.set('Origin', source);
      expect((await r).status).toBe(403);
    }
    const r = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('limite les tentatives et ne journalise pas les secrets', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 15; i++)
      await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .send({ email: 'none@test.local', password: pass });
    const r = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email: 'none@test.local', password: pass });
    expect(r.status).toBe(429);
    const events = JSON.stringify(await db.auditEvent.findMany());
    expect(events).not.toContain(pass);
    expect(events).not.toContain('accessToken');
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
describe('autorisation et confidentialité', () => {
  it('filtre liste, recherche et compteurs par propriétaire ; refuse un UUID connu', async () => {
    const a = await user(),
      b = await user();
    await ticket(a);
    const hidden = await ticket(b);
    const list = await get('/tickets', a);
    expect(list.body.total).toBe(1);
    expect(JSON.stringify(list.body)).not.toContain(hidden.id);
    expect((await get(`/tickets/${hidden.id}`, a)).status).toBe(403);
    expect((await get('/tickets?q=confidentiel', a)).body.total).toBe(1);
  });
  it('n’envoie jamais de note interne au client et interdit leur création', async () => {
    const customer = await user(),
      agent = await user('AGENT');
    const t = await ticket(customer, agent.id);
    await db.ticketMessage.create({
      data: {
        ticketId: t.id,
        authorId: agent.id,
        visibility: 'INTERNAL',
        content: 'SECRET INTERNAL CONTENT',
      },
    });
    expect(JSON.stringify((await get(`/tickets/${t.id}`, customer)).body)).not.toContain('SECRET');
    const r = await request(app)
      .post(`/api/v1/tickets/${t.id}/messages`)
      .auth(customer.token, { type: 'bearer' })
      .send({ content: 'Note', visibility: 'INTERNAL' });
    expect(r.status).toBe(403);
    expect((await get(`/tickets/${t.id}`, agent)).body.messages).toHaveLength(1);
  });
  it('un agent ne lit/modifie pas un ticket attribué à un autre agent', async () => {
    const c = await user(),
      a = await user('AGENT'),
      b = await user('AGENT');
    const t = await ticket(c, b.id);
    expect((await get(`/tickets/${t.id}`, a)).status).toBe(403);
    expect((await get('/tickets', a)).body.total).toBe(0);
    expect(
      (
        await request(app)
          .patch(`/api/v1/tickets/${t.id}/priority`)
          .auth(a.token, { type: 'bearer' })
          .send({ priority: 'URGENT' })
      ).status,
    ).toBe(403);
  });
  it('exige la prise en charge et arbitre les réclamations concurrentes', async () => {
    const c = await user(),
      a = await user('AGENT'),
      b = await user('AGENT');
    const t = await ticket(c);
    expect((await get(`/tickets/${t.id}`, a)).status).toBe(200);
    expect(
      (
        await request(app)
          .post(`/api/v1/tickets/${t.id}/messages`)
          .auth(a.token, { type: 'bearer' })
          .send({ content: 'Réponse' })
      ).status,
    ).toBe(403);
    const results = await Promise.all(
      [a, b].map((u) =>
        request(app).post(`/api/v1/tickets/${t.id}/claim`).auth(u.token, { type: 'bearer' }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
  it('interdit les routes agent/admin aux clients et les routes admin aux agents', async () => {
    const c = await user(),
      a = await user('AGENT'),
      admin = await user('ADMIN');
    const t = await ticket(c);
    for (const u of [c, a]) {
      expect((await get('/users', u)).status).toBe(403);
      expect((await get('/audit', u)).status).toBe(403);
      expect(
        (
          await request(app)
            .patch(`/api/v1/users/${u.id}`)
            .auth(u.token, { type: 'bearer' })
            .send({ role: 'ADMIN' })
        ).status,
      ).toBe(403);
    }
    expect(
      (await request(app).post(`/api/v1/tickets/${t.id}/claim`).auth(c.token, { type: 'bearer' }))
        .status,
    ).toBe(403);
    expect((await get('/users', admin)).status).toBe(200);
    expect(JSON.stringify((await get('/users', admin)).body)).not.toContain('passwordHash');
  });
  it('applique les transitions et la fermeture par le propriétaire', async () => {
    const c = await user(),
      a = await user('AGENT');
    const t = await ticket(c, a.id);
    const change = (u: Login, status: string) =>
      request(app)
        .patch(`/api/v1/tickets/${t.id}/status`)
        .auth(u.token, { type: 'bearer' })
        .send({ status });
    expect((await change(c, 'CLOSED')).status).toBe(409);
    expect((await change(a, 'RESOLVED')).status).toBe(200);
    expect((await change(c, 'CLOSED')).status).toBe(200);
    expect((await change(a, 'IN_PROGRESS')).status).toBe(409);
    expect(canTransition('AGENT', 'OPEN', 'CLOSED')).toBe(false);
  });
  it('protège le dernier admin, même avec deux rétrogradations simultanées', async () => {
    const a = await user('ADMIN');
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${a.id}`)
          .auth(a.token, { type: 'bearer' })
          .send({ status: 'DISABLED' })
      ).status,
    ).toBe(409);
    const b = await user('ADMIN');
    const results = await Promise.all(
      [a, b].map((u) =>
        request(app)
          .patch(`/api/v1/users/${u.id}`)
          .auth(u.token, { type: 'bearer' })
          .send({ role: 'CUSTOMER' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).toBe(1);
  });
  it('audite les modifications et invalide immédiatement un compte désactivé', async () => {
    const a = await user('ADMIN'),
      b = await user('AGENT'),
      c = await user();
    const t = await ticket(c, b.id);
    expect(
      (
        await request(app)
          .patch(`/api/v1/users/${b.id}`)
          .auth(a.token, { type: 'bearer' })
          .send({ status: 'DISABLED' })
      ).status,
    ).toBe(200);
    expect((await get('/auth/me', b)).status).toBe(401);
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).assignedAgentId).toBeNull();
    expect(await db.auditEvent.count({ where: { action: 'USER_STATUS_CHANGED' } })).toBe(1);
  });
  it('interdit la révocation d’une session tierce et masque son secret', async () => {
    const a = await user(),
      b = await user();
    const sessions = await get('/auth/sessions', a);
    expect(JSON.stringify(sessions.body)).not.toContain('secretHash');
    expect(
      (
        await request(app)
          .delete(`/api/v1/auth/sessions/${b.sid}`)
          .auth(a.token, { type: 'bearer' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/v1/auth/sessions/${a.sid}`)
          .auth(a.token, { type: 'bearer' })
      ).status,
    ).toBe(204);
    expect((await get('/auth/me', a)).status).toBe(401);
  });
  it('sert OpenAPI sans secret et retourne des erreurs stables', async () => {
    const spec = await request(app).get('/api/openapi.json');
    expect(spec.body.openapi).toBe('3.1.0');
    expect(spec.body.paths['/tickets/{id}/messages']).toBeDefined();
    const u = await user();
    const r = await get('/tickets/not-a-uuid', u);
    expect(r.status).toBe(422);
    expect(r.body.error.requestId).toBeTruthy();
    expect(r.body.error.stack).toBeUndefined();
    const token = await signAccess(u.id, u.sid);
    expect(token.split('.')).toHaveLength(3);
  });
});
