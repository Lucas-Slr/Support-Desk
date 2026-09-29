import type { RequestHandler } from 'express';
import { db } from '../database/client.js';
import { verifyAccess } from '../security/tokens.js';
import { unauthorized, denied } from '../shared/errors.js';
import { publicUser } from '../modules/users/select.js';
import { uuid } from '../shared/validation.js';
import type { Role, User } from '../generated/prisma/client.js';
export type Actor = Pick<User, 'id' | 'email' | 'displayName' | 'role' | 'status' | 'createdAt'>;
declare module 'express-serve-static-core' {
  interface Request {
    actor: Actor;
    sessionId: string;
  }
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  const bearer = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer) throw unauthorized();
  let claims;
  try {
    claims = await verifyAccess(bearer);
    uuid.parse(claims.userId);
    uuid.parse(claims.sessionId);
  } catch {
    throw unauthorized();
  }
  const session = await db.session.findUnique({
    where: { id: claims.sessionId },
    include: { user: { select: publicUser } },
  });
  if (
    !session ||
    session.userId !== claims.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.user.status !== 'ACTIVE'
  )
    throw unauthorized();
  req.actor = session.user;
  req.sessionId = session.id;
  next();
};
export const roles =
  (...allowed: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!allowed.includes(req.actor.role)) throw denied();
    next();
  };
