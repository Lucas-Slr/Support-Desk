import { db } from '../../database/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Actor } from '../../middlewares/authenticate.js';
import { canRead } from './policy.js';
import { AppError, denied } from '../../shared/errors.js';
import { filters } from './schemas.js';
import type { z } from 'zod';
export function scope(actor: Actor): Prisma.TicketWhereInput {
  return actor.role === 'ADMIN'
    ? {}
    : actor.role === 'CUSTOMER'
      ? { authorId: actor.id }
      : { OR: [{ assignedAgentId: null }, { assignedAgentId: actor.id }] };
}
export async function listTickets(actor: Actor, query: z.infer<typeof filters>) {
  const where: Prisma.TicketWhereInput = {
    AND: [
      scope(actor),
      {
        status: query.status,
        priority: query.priority,
        ...(query.q
          ? {
              OR: [
                { subject: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.assignment === 'mine'
          ? { assignedAgentId: actor.id }
          : query.assignment === 'unassigned'
            ? { assignedAgentId: null }
            : {}),
      },
    ],
  };
  const [items, total] = await db.$transaction([
    db.ticket.findMany({
      where,
      orderBy: [{ createdAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.ticket.count({ where }),
  ]);
  return { items, total, page: query.page, pageSize: query.pageSize };
}
export async function getTicket(actor: Actor, id: string, client: Prisma.TransactionClient = db) {
  const ticket = await client.ticket.findUnique({ where: { id } });
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Ticket introuvable.');
  if (!canRead(actor, ticket)) throw denied();
  return ticket;
}
export async function mutateTicket<T>(
  actor: Actor,
  id: string,
  operation: (
    ticket: Awaited<ReturnType<typeof getTicket>>,
    tx: Prisma.TransactionClient,
  ) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id=${id}::uuid FOR UPDATE`;
    return operation(await getTicket(actor, id, tx), tx);
  });
}
