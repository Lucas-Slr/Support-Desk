import { Router } from 'express';
import { db } from '../../database/client.js';
import { authenticate, roles } from '../../middlewares/authenticate.js';
import { pagination } from '../../shared/validation.js';
export const auditRoutes = Router();
auditRoutes.use(authenticate, roles('ADMIN'));
auditRoutes.get('/', async (req, res) => {
  const { page, pageSize } = pagination.parse(req.query);
  const [items, total] = await db.$transaction([
    db.auditEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditEvent.count(),
  ]);
  res.json({ items, total, page, pageSize });
});
