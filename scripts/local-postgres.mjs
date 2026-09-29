import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, readFileSync } from 'node:fs';
const { password } = JSON.parse(readFileSync('.local/postgres.json', 'utf8'));
const pg = new EmbeddedPostgres({
  databaseDir: '.local/postgres',
  user: 'support',
  password,
  port: 55432,
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync('.local/postgres/PG_VERSION')) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ['support_desk', 'support_desk_test']) {
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
  if (!result.rowCount) await pg.createDatabase(name);
}
await client.end();
console.info('PostgreSQL local prêt sur 127.0.0.1:55432 (développement + tests isolés).');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void pg.stop().then(() => process.exit(0));
  });
setInterval(() => {}, 60_000);
