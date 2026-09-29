import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const denied = () =>
  new AppError(403, 'FORBIDDEN', 'Cette action ne vous est pas autorisée.');
export const unauthorized = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Authentification requise ou session expirée.');
export const conflict = () =>
  new AppError(409, 'CONFLICT', 'Cette opération est en conflit avec l’état actuel.');
export const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  let status = 500,
    code = 'INTERNAL_ERROR',
    message = 'Une erreur interne est survenue.';
  let fields: Record<string, string[]> | undefined;
  if (error instanceof AppError) {
    ({ status, code, message } = error);
  } else if (error instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Vérifiez les champs du formulaire.';
    fields = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'body';
      (fields[key] ??= []).push(issue.message);
    }
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) {
    status = 409;
    code = 'CONFLICT';
    message = 'Cette opération ne peut pas être effectuée.';
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = 'BAD_REQUEST';
    message = 'Requête JSON invalide.';
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 413
  ) {
    status = 400;
    code = 'BODY_TOO_LARGE';
    message = 'Requête trop volumineuse.';
  }
  // Ne pas sérialiser les erreurs ORM, les en-têtes ou les corps des requêtes.
  if (status === 500)
    console.error(JSON.stringify({ event: 'request_failed', requestId: res.locals.requestId }));
  res.status(status).json({
    error: { code, message, requestId: res.locals.requestId, ...(fields ? { fields } : {}) },
  });
};
