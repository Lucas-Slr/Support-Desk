import { z } from 'zod';
export const uuid = z.uuid();
export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const password = z
  .string()
  .min(12, 'Au moins 12 caractères.')
  .max(128, 'Au maximum 128 caractères.');
