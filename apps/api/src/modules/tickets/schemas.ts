import { z } from 'zod';
import { pagination } from '../../shared/validation.js';
export const status = z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED']);
export const priority = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const filters = pagination.extend({
  q: z.string().trim().max(160).optional(),
  status: status.optional(),
  priority: priority.optional(),
  assignment: z.enum(['all', 'mine', 'unassigned']).default('all'),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});
export const newTicket = z
  .object({
    subject: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(10000),
  })
  .strict();
export const newMessage = z
  .object({
    content: z.string().trim().min(1).max(10000),
    visibility: z.enum(['PUBLIC', 'INTERNAL']).default('PUBLIC'),
  })
  .strict();
