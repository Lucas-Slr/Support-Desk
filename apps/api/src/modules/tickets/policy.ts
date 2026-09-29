import type { Role, TicketStatus } from '../../generated/prisma/client.js';
type Actor = { id: string; role: Role };
type Resource = { authorId: string; assignedAgentId: string | null };
export const canRead = (actor: Actor, ticket: Resource) =>
  actor.role === 'ADMIN' ||
  (actor.role === 'CUSTOMER'
    ? ticket.authorId === actor.id
    : ticket.assignedAgentId === null || ticket.assignedAgentId === actor.id);
export const canManage = (actor: Actor, ticket: Resource) =>
  actor.role === 'ADMIN' || (actor.role === 'AGENT' && ticket.assignedAgentId === actor.id);
const transitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};
export const canTransition = (role: Role, from: TicketStatus, to: TicketStatus) =>
  role === 'CUSTOMER' ? from === 'RESOLVED' && to === 'CLOSED' : transitions[from].includes(to);
