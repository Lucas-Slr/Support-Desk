import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './database/client.js';
await db.$connect();
const server = createApp().listen(env.PORT, env.HOST, () =>
  console.info(`Support Desk API : http://${env.HOST}:${env.PORT}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
