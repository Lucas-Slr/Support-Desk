import 'dotenv/config';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('/support_desk_test'))
  throw new Error('Une base isolée nommée support_desk_test est requise.');
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-distinct-from-development-0123456789';
process.env.JWT_ISSUER = 'support-desk-api';
process.env.JWT_AUDIENCE = 'support-desk-web';
process.env.ALLOWED_ORIGINS = 'http://localhost:4200';
