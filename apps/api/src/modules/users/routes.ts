import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../database/client.js';
import { authenticate, roles } from '../../middlewares/authenticate.js';
import { pagination, uuid } from '../../shared/validation.js';
import { publicUser } from './select.js';
import { audit } from '../audit/service.js';
import { AppError, conflict } from '../../shared/errors.js';
export const userRoutes = Router();
userRoutes.use(authenticate, roles('ADMIN'));
userRoutes.get('/', async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const [items, total] = await db.$transaction([
    db.user.findMany({
      select: publicUser,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
    db.user.count(),
  ]);
  res.json({ items, total, page, pageSize });
});
userRoutes.get('/:id', async (req, res) => {
  const user = await db.user.findUnique({
    where: { id: uuid.parse(req.params.id) },
    select: publicUser,
  });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
  res.json(user);
});
userRoutes.patch('/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  const data = z
    .object({
      role: z.enum(['CUSTOMER', 'AGENT', 'ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    })
    .strict()
    .refine((v) => v.role !== undefined || v.status !== undefined)
    .parse(req.body);
  const user = await db.$transaction(async (tx) => {
    // Tous les changements de rôle/statut partagent ce verrou, y compris deux rétrogradations simultanées.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(723194)::text`;
    const actor = await tx.user.findUnique({ where: { id: req.actor.id } });
    if (actor?.role !== 'ADMIN' || actor.status !== 'ACTIVE') throw conflict();
    const previous = await tx.user.findUnique({ where: { id } });
    if (!previous) throw new AppError(404, 'NOT_FOUND', 'Utilisateur introuvable.');
    if (
      previous.role === 'ADMIN' &&
      previous.status === 'ACTIVE' &&
      ((data.role && data.role !== 'ADMIN') || data.status === 'DISABLED') &&
      (await tx.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) <= 1
    )
      throw new AppError(409, 'LAST_ADMIN', 'Le dernier administrateur actif doit être conservé.');
    const updated = await tx.user.update({ where: { id }, data, select: publicUser });
    if (data.role !== undefined || data.status === 'DISABLED')
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    if (data.status === 'DISABLED' || data.role === 'CUSTOMER')
      await tx.ticket.updateMany({
        where: { assignedAgentId: id },
        data: { assignedAgentId: null },
      });
    if (data.role !== undefined)
      await audit(
        req.actor.id,
        'USER_ROLE_CHANGED',
        'User',
        id,
        { from: previous.role, to: data.role },
        tx,
      );
    if (data.status !== undefined)
      await audit(
        req.actor.id,
        'USER_STATUS_CHANGED',
        'User',
        id,
        { from: previous.status, to: data.status },
        tx,
      );
    return updated;
  });
  res.json(user);
});
userRoutes.delete('/:id/sessions', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await db.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(req.actor.id, 'USER_SESSIONS_REVOKED', 'User', id, {}, tx);
  });
  res.sendStatus(204);
});
