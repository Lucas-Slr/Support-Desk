import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  DATABASE_URL: z.url().refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://')),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.includes('REPLACE') && !v.includes('CHANGE_ME')),
  JWT_ISSUER: z.string().min(1).default('support-desk-api'),
  JWT_AUDIENCE: z.string().min(1).default('support-desk-web'),
  ALLOWED_ORIGINS: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()))
    .pipe(z.array(z.url().refine((v) => new URL(v).origin === v)).min(1)),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success)
  throw new Error(
    'Configuration invalide : ' + parsed.error.issues.map((i) => i.path.join('.')).join(', '),
  );
export const env = parsed.data;
if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.some((v) => !v.startsWith('https://')))
  throw new Error('HTTPS requis en production');
