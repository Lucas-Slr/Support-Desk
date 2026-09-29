import { db } from '../../database/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
export function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Prisma.InputJsonObject = {},
  client: Prisma.TransactionClient = db,
) {
  return client.auditEvent.create({ data: { actorId, action, targetType, targetId, metadata } });
}
