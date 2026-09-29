import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { db } from '../../database/client.js';
import { digest, newSecret, signAccess } from '../../security/tokens.js';
import { unauthorized, AppError } from '../../shared/errors.js';
import { publicUser } from '../users/select.js';
import { audit } from '../audit/service.js';
import { uuid } from '../../shared/validation.js';
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const dummyHash = hashPassword(newSecret());
export async function createSession(userId: string, userAgent: string | undefined) {
  const secret = newSecret();
  const id = randomUUID();
  const session = await db.session.create({
    data: {
      id,
      userId,
      secretHash: digest(secret),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
      userAgent: userAgent?.slice(0, 256),
    },
  });
  return {
    accessToken: await signAccess(userId, id),
    refreshToken: `${id}.${secret}`,
    expiresAt: session.expiresAt,
  };
}
export async function login(email: string, password: string, userAgent: string | undefined) {
  const user = await db.user.findUnique({ where: { email } });
  const valid = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !valid || user.status !== 'ACTIVE') {
    await audit(null, 'LOGIN_FAILED', 'Authentication', null);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
  }
  const session = await createSession(user.id, userAgent);
  await audit(user.id, 'LOGIN_SUCCEEDED', 'Session', session.refreshToken.split('.')[0]!);
  return {
    ...session,
    user: await db.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUser }),
  };
}
export function parseRefresh(value: unknown) {
  if (typeof value !== 'string') throw unauthorized();
  const [id, secret, ...rest] = value.split('.');
  if (!uuid.safeParse(id).success || !secret || !/^[A-Za-z0-9_-]{43}$/.test(secret) || rest.length)
    throw unauthorized();
  return { id: id!, secret };
}
export async function refresh(value: unknown) {
  const { id, secret } = parseRefresh(value);
  const result = await db.$transaction(async (tx) => {
    // Verrou de ligne : une seule rotation peut consommer le secret courant.
    await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${id}::uuid FOR UPDATE`;
    const session = await tx.session.findUnique({
      where: { id },
      include: { user: { select: publicUser } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    )
      return null;
    if (session.secretHash !== digest(secret)) {
      await tx.session.update({ where: { id }, data: { revokedAt: new Date() } });
      await audit(session.userId, 'REFRESH_REUSE', 'Session', id, {}, tx);
      return null; // Retourner, et non lever, pour conserver la révocation.
    }
    const nextSecret = newSecret();
    await tx.session.update({
      where: { id },
      data: { secretHash: digest(nextSecret), lastUsedAt: new Date() },
    });
    return {
      user: session.user,
      refreshToken: `${id}.${nextSecret}`,
      expiresAt: session.expiresAt,
    };
  });
  if (!result) throw unauthorized();
  return { ...result, accessToken: await signAccess(result.user.id, id) };
}
