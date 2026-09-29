import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
const local = existsSync('apps/api/.env') ? parse(readFileSync('apps/api/.env')) : {};
const url = process.env.TEST_DATABASE_URL ?? local.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('/support_desk_test'))
  throw new Error('Base de test isolée requise');
const result = spawnSync(
  process.execPath,
  ['../../node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { cwd: 'apps/api', env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
