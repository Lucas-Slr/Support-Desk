import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../shared/errors.js';
export const requestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId as string);
  next();
};
export const originRequired: RequestHandler = (req, _res, next) => {
  if (!req.headers.origin || !env.ALLOWED_ORIGINS.includes(req.headers.origin))
    throw new AppError(403, 'ORIGIN_REJECTED', 'Origine de la requête refusée.');
  next();
};
export function limiter(limit: number, windowMs = 60_000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Trop de tentatives. Réessayez plus tard.',
          requestId: res.locals.requestId,
        },
      }),
  });
}
