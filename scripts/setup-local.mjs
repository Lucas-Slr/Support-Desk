import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
if (existsSync('apps/api/.env'))
  throw new Error('apps/api/.env existe déjà ; configuration conservée.');
const dbPassword = randomBytes(24).toString('hex');
const demoPassword = randomBytes(16).toString('base64url');
mkdirSync('.local', { recursive: true });
writeFileSync('.local/postgres.json', JSON.stringify({ password: dbPassword }));
writeFileSync(
  'apps/api/.env',
  `NODE_ENV=development\nPORT=3100\nDATABASE_URL=postgresql://support:${dbPassword}@localhost:55432/support_desk\nTEST_DATABASE_URL=postgresql://support:${dbPassword}@localhost:55432/support_desk_test\nJWT_SECRET=${randomBytes(48).toString('hex')}\nJWT_ISSUER=support-desk-api\nJWT_AUDIENCE=support-desk-web\nALLOWED_ORIGINS=http://localhost:4200\nDEMO_PASSWORD=${demoPassword}\n`,
);
console.info(
  'Configuration locale générée. Le mot de passe de démonstration est dans apps/api/.env (DEMO_PASSWORD).',
);
