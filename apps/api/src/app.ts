import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { errors, AppError } from './shared/errors.js';
import { requestId, limiter } from './middlewares/security.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import { ticketRoutes } from './modules/tickets/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { openapi } from './openapi.js';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    requestId,
    helmet(),
    cors({ origin: env.ALLOWED_ORIGINS, credentials: true }),
    express.json({ limit: '32kb' }),
    cookieParser(),
  );
  app.use('/api', limiter(300), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/v1/auth', createAuthRoutes());
  app.use('/api/v1/tickets', ticketRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/audit', auditRoutes);
  if (env.NODE_ENV !== 'production') {
    app.get('/api/openapi.json', (_req, res) => res.json(openapi));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));
  }
  app.use((_req, _res) => {
    throw new AppError(404, 'NOT_FOUND', 'Ressource introuvable.');
  });
  app.use(errors);
  return app;
}
