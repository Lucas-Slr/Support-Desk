import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { db } from '../../database/client.js';
import { env } from '../../config/env.js';
import { email, password, uuid } from '../../shared/validation.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { limiter, originRequired } from '../../middlewares/security.js';
import { createSession, hashPassword, login, refresh } from './service.js';
import { publicUser } from '../users/select.js';
import { audit } from '../audit/service.js';
import { AppError } from '../../shared/errors.js';
const cookieName = 'sd_refresh';
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};
function deliver(
  res: Response,
  result: { refreshToken: string; accessToken: string; user: unknown; expiresAt: Date },
  status = 200,
) {
  res.cookie(cookieName, result.refreshToken, { ...cookieOptions, expires: result.expiresAt });
  res.status(status).json({ accessToken: result.accessToken, user: result.user });
}
export function createAuthRoutes() {
  const authRoutes = Router();
  authRoutes.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  authRoutes.post('/register', originRequired, limiter(10, 15 * 60_000), async (req, res) => {
    const input = z
      .object({ email, password, displayName: z.string().trim().min(2).max(80) })
      .strict()
      .parse(req.body);
    // Une entrée contenant role/status est refusée, jamais propagée à Prisma.
    if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } }))
      throw new AppError(
        409,
        'REGISTRATION_UNAVAILABLE',
        'Inscription impossible avec ces informations.',
      );
    const user = await db.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER',
      },
      select: publicUser,
    });
    deliver(res, { ...(await createSession(user.id, req.headers['user-agent'])), user }, 201);
  });
  authRoutes.post('/login', originRequired, limiter(15, 15 * 60_000), async (req, res) => {
    const input = z
      .object({ email, password: z.string().min(1).max(128) })
      .strict()
      .parse(req.body);
    deliver(res, await login(input.email, input.password, req.headers['user-agent']));
  });
  authRoutes.post('/refresh', originRequired, limiter(60), async (req, res) => {
    try {
      deliver(res, await refresh((req.cookies as Record<string, unknown>)[cookieName]));
    } catch (error) {
      res.clearCookie(cookieName, cookieOptions);
      throw error;
    }
  });
  authRoutes.use(authenticate);
  authRoutes.get('/me', (req, res) => res.json(req.actor));
  authRoutes.post('/logout', originRequired, async (req, res) => {
    await db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: req.sessionId, userId: req.actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(req.actor.id, 'SESSION_REVOKED', 'Session', req.sessionId, {}, tx);
    });
    res.clearCookie(cookieName, cookieOptions);
    res.sendStatus(204);
  });
  authRoutes.post('/logout-all', originRequired, async (req, res) => {
    await db.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: req.actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(req.actor.id, 'LOGOUT_ALL', 'User', req.actor.id, {}, tx);
    });
    res.clearCookie(cookieName, cookieOptions);
    res.sendStatus(204);
  });
  authRoutes.get('/sessions', async (req, res) => {
    const sessions = await db.session.findMany({
      where: { userId: req.actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(sessions.map((s) => ({ ...s, current: s.id === req.sessionId })));
  });
  authRoutes.delete('/sessions/:sessionId', async (req, res) => {
    const id = uuid.parse(req.params.sessionId);
    await db.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { id, userId: req.actor.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new AppError(404, 'NOT_FOUND', 'Session introuvable.');
      await audit(req.actor.id, 'SESSION_REVOKED', 'Session', id, {}, tx);
    });
    if (id === req.sessionId) res.clearCookie(cookieName, cookieOptions);
    res.sendStatus(204);
  });
  return authRoutes;
}
