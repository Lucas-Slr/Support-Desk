import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../database/client.js';
import { authenticate, roles } from '../../middlewares/authenticate.js';
import { uuid } from '../../shared/validation.js';
import { denied, conflict } from '../../shared/errors.js';
import { audit } from '../audit/service.js';
import { canManage, canTransition } from './policy.js';
import { filters, newTicket, newMessage, priority, status } from './schemas.js';
import { listTickets, getTicket, mutateTicket } from './service.js';
export const ticketRoutes = Router();
ticketRoutes.use(authenticate);
ticketRoutes.get('/', async (req, res) =>
  res.json(await listTickets(req.actor, filters.parse(req.query))),
);
ticketRoutes.post('/', roles('CUSTOMER'), async (req, res) => {
  const data = newTicket.parse(req.body);
  res.status(201).json(await db.ticket.create({ data: { ...data, authorId: req.actor.id } }));
});
ticketRoutes.get('/:id', async (req, res) => {
  const ticket = await getTicket(req.actor, uuid.parse(req.params.id));
  const messages = await db.ticketMessage.findMany({
    where: {
      ticketId: ticket.id,
      ...(req.actor.role === 'CUSTOMER' ? { visibility: 'PUBLIC' as const } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  res.json({ ...ticket, messages });
});
ticketRoutes.post('/:id/claim', roles('AGENT', 'ADMIN'), async (req, res) => {
  res.json(
    await mutateTicket(req.actor, uuid.parse(req.params.id), async (ticket, tx) => {
      if (ticket.assignedAgentId || ticket.status === 'CLOSED') throw conflict();
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          assignedAgentId: req.actor.id,
          status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status,
        },
      });
      await audit(req.actor.id, 'TICKET_CLAIMED', 'Ticket', ticket.id, {}, tx);
      return updated;
    }),
  );
});
ticketRoutes.patch('/:id/assignment', roles('ADMIN'), async (req, res) => {
  const { assignedAgentId } = z
    .object({ assignedAgentId: uuid.nullable() })
    .strict()
    .parse(req.body);
  res.json(
    await mutateTicket(req.actor, uuid.parse(req.params.id), async (ticket, tx) => {
      if (assignedAgentId) {
        const user = await tx.user.findFirst({
          where: { id: assignedAgentId, status: 'ACTIVE', role: { in: ['AGENT', 'ADMIN'] } },
        });
        if (!user) throw conflict();
      }
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { assignedAgentId },
      });
      await audit(req.actor.id, 'TICKET_ASSIGNED', 'Ticket', ticket.id, { assignedAgentId }, tx);
      return updated;
    }),
  );
});
ticketRoutes.patch('/:id/status', async (req, res) => {
  const input = z.object({ status }).strict().parse(req.body);
  res.json(
    await mutateTicket(req.actor, uuid.parse(req.params.id), async (ticket, tx) => {
      if (req.actor.role !== 'CUSTOMER' && !canManage(req.actor, ticket)) throw denied();
      if (!canTransition(req.actor.role, ticket.status, input.status)) throw conflict();
      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: input.status,
          resolvedAt:
            input.status === 'RESOLVED'
              ? new Date()
              : input.status === 'CLOSED'
                ? ticket.resolvedAt
                : null,
        },
      });
      await audit(
        req.actor.id,
        'TICKET_STATUS_CHANGED',
        'Ticket',
        ticket.id,
        { from: ticket.status, to: input.status },
        tx,
      );
      return updated;
    }),
  );
});
ticketRoutes.patch('/:id/priority', roles('AGENT', 'ADMIN'), async (req, res) => {
  const input = z.object({ priority }).strict().parse(req.body);
  res.json(
    await mutateTicket(req.actor, uuid.parse(req.params.id), async (ticket, tx) => {
      if (!canManage(req.actor, ticket)) throw denied();
      if (ticket.status === 'CLOSED') throw conflict();
      return tx.ticket.update({ where: { id: ticket.id }, data: input });
    }),
  );
});
ticketRoutes.post('/:id/messages', async (req, res) => {
  const input = newMessage.parse(req.body);
  res.status(201).json(
    await mutateTicket(req.actor, uuid.parse(req.params.id), async (ticket, tx) => {
      if (req.actor.role === 'CUSTOMER') {
        if (input.visibility !== 'PUBLIC') throw denied();
      } else if (!canManage(req.actor, ticket)) throw denied();
      if (['CLOSED', 'RESOLVED'].includes(ticket.status)) throw conflict();
      const message = await tx.ticketMessage.create({
        data: { ...input, ticketId: ticket.id, authorId: req.actor.id },
      });
      if (input.visibility === 'INTERNAL')
        await audit(req.actor.id, 'INTERNAL_NOTE_ADDED', 'Ticket', ticket.id, {}, tx);
      return message;
    }),
  );
});
