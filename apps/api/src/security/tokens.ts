import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
const key = new TextEncoder().encode(env.JWT_SECRET);
export const digest = (secret: string) => createHash('sha256').update(secret).digest('hex');
export const newSecret = () => randomBytes(32).toString('base64url');
export const signAccess = (userId: string, sessionId: string) =>
  new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('10m')
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .sign(key);
export async function verifyAccess(token: string) {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ['HS256'],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp', 'iss', 'aud'],
    typ: 'JWT',
  });
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.sid !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.iat !== 'number'
  )
    throw new Error('Invalid claims');
  return { userId: payload.sub, sessionId: payload.sid };
}
