type Schema = Record<string, unknown>;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const str = { type: 'string' };
const id = { type: 'string', format: 'uuid' };
const object = (properties: Schema, required: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const body = (schema: Schema) => ({ required: true, content: { 'application/json': { schema } } });
const json = (schema: Schema) => ({
  description: 'Succès',
  content: { 'application/json': { schema } },
});
const page = (name: string) =>
  object(
    {
      items: { type: 'array', items: ref(name) },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
    },
    ['items', 'total', 'page', 'pageSize'],
  );
const query = (name: string, schema: Schema) => ({ in: 'query', name, schema });
const pages = [
  query('page', { type: 'integer', minimum: 1, default: 1 }),
  query('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
];
const path = (name = 'id') => ({ in: 'path', name, required: true, schema: id });
const errorResponses = Object.fromEntries(
  [400, 401, 403, 404, 409, 422, 429, 500].map((code) => [
    code,
    {
      description: (
        {
          400: 'Requête invalide',
          401: 'Authentification absente ou invalide',
          403: 'Action ou origine interdite',
          404: 'Ressource introuvable',
          409: 'Conflit métier ou inscription indisponible',
          422: 'Validation',
          429: 'Limite de requêtes atteinte',
          500: 'Erreur interne',
        } as Record<number, string>
      )[code],
      content: { 'application/json': { schema: ref('Error') } },
    },
  ]),
);
function operation(
  summary: string,
  roles: string,
  response: Schema = ref('Ticket'),
  options: Record<string, unknown> = {},
) {
  return {
    summary,
    description: roles,
    security: [{ bearerAuth: [] }],
    responses: { '200': json(response), ...errorResponses },
    ...options,
  };
}
const authResponse = object({ accessToken: str, user: ref('User') }, ['accessToken', 'user']);
const ticketSchema = object(
  {
    id,
    authorId: id,
    assignedAgentId: { type: ['string', 'null'], format: 'uuid' },
    subject: str,
    description: str,
    status: { enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'] },
    priority: { enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
    createdAt: str,
    updatedAt: str,
    resolvedAt: { type: ['string', 'null'] },
  },
  ['id', 'authorId', 'subject', 'description', 'status', 'priority'],
);
export const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Support Desk API',
    version: '1.0.0',
    description:
      'API pédagogique. JWT en mémoire, refresh opaque en cookie HttpOnly sd_refresh (Path=/api/v1/auth, SameSite=Strict). Origin exact requis pour register, login, refresh, logout et logout-all. Les rôles sont relus en base. UUID connus ne confèrent aucun droit.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'sd_refresh' },
    },
    schemas: {
      Error: object(
        {
          error: object(
            {
              code: str,
              message: str,
              requestId: { type: 'string', format: 'uuid' },
              fields: { type: 'object', additionalProperties: { type: 'array', items: str } },
            },
            ['code', 'message', 'requestId'],
          ),
        },
        ['error'],
      ),
      User: object(
        {
          id,
          email: { type: 'string', format: 'email' },
          displayName: str,
          role: { enum: ['CUSTOMER', 'AGENT', 'ADMIN'] },
          status: { enum: ['ACTIVE', 'DISABLED'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
        ['id', 'email', 'displayName', 'role', 'status', 'createdAt'],
      ),
      Ticket: ticketSchema,
      TicketDetail: object(
        { ...ticketSchema.properties, messages: { type: 'array', items: ref('Message') } },
        [...ticketSchema.required, 'messages'],
      ),
      Message: object(
        {
          id,
          ticketId: id,
          authorId: id,
          content: str,
          visibility: { enum: ['PUBLIC', 'INTERNAL'] },
          createdAt: str,
        },
        ['id', 'ticketId', 'authorId', 'content', 'visibility', 'createdAt'],
      ),
      Session: object(
        {
          id,
          userAgent: { type: ['string', 'null'] },
          createdAt: str,
          expiresAt: str,
          lastUsedAt: str,
          current: { type: 'boolean' },
        },
        ['id', 'createdAt', 'expiresAt', 'lastUsedAt', 'current'],
      ),
      AuditEvent: object(
        {
          id,
          actorId: { type: ['string', 'null'] },
          action: str,
          targetType: str,
          targetId: { type: ['string', 'null'] },
          metadata: { type: 'object' },
          createdAt: str,
        },
        ['id', 'action', 'targetType', 'createdAt'],
      ),
    },
  },
  paths: {
    '/health': {
      get: operation('État du serveur', 'Public', object({ status: { const: 'ok' } }), {
        security: [],
      }),
    },
    '/auth/register': {
      post: operation(
        'Créer un compte client',
        'Public. Aucun champ role ou status accepté. Origin obligatoire.',
        authResponse,
        {
          security: [],
          requestBody: body(
            object(
              {
                displayName: { type: 'string', minLength: 2, maxLength: 80 },
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 12, maxLength: 128 },
              },
              ['displayName', 'email', 'password'],
            ),
          ),
          responses: { '201': json(authResponse), ...errorResponses },
        },
      ),
    },
    '/auth/login': {
      post: operation(
        'Se connecter',
        'Public. Origin obligatoire. Réponse générique en cas d’échec.',
        authResponse,
        {
          security: [],
          requestBody: body(
            object(
              {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', minLength: 1, maxLength: 128 },
              },
              ['email', 'password'],
            ),
          ),
        },
      ),
    },
    '/auth/refresh': {
      post: operation(
        'Renouveler et faire tourner le secret',
        'Cookie + Origin requis. Une réutilisation révoque la session. Expiration absolue à 7 jours.',
        authResponse,
        {
          security: [{ refreshCookie: [] }],
          parameters: [
            {
              in: 'header',
              name: 'Origin',
              required: true,
              schema: { type: 'string', format: 'uri' },
              example: 'http://localhost:4200',
            },
          ],
        },
      ),
    },
    '/auth/logout': {
      post: operation(
        'Fermer cette session',
        'Tous les rôles. Origin requis.',
        {},
        {
          responses: {
            '204': { description: 'Session révoquée et cookie effacé' },
            ...errorResponses,
          },
        },
      ),
    },
    '/auth/logout-all': {
      post: operation(
        'Fermer toutes ses sessions',
        'Tous les rôles. Origin requis.',
        {},
        {
          responses: {
            '204': { description: 'Toutes les sessions révoquées, cookie effacé' },
            ...errorResponses,
          },
        },
      ),
    },
    '/auth/me': { get: operation('Profil courant', 'Tous les rôles', ref('User')) },
    '/auth/sessions': {
      get: operation('Sessions actives personnelles', 'Tous les rôles', {
        type: 'array',
        items: ref('Session'),
      }),
    },
    '/auth/sessions/{sessionId}': {
      delete: operation(
        'Révoquer une session personnelle',
        'Propriétaire uniquement',
        {},
        {
          parameters: [path('sessionId')],
          responses: { '204': { description: 'Révoquée' }, ...errorResponses },
        },
      ),
    },
    '/tickets': {
      get: operation(
        'Rechercher les tickets accessibles',
        'CUSTOMER : ses tickets. AGENT : non attribués et les siens. ADMIN : tous. Les compteurs suivent le même filtre.',
        page('Ticket'),
        {
          parameters: [
            ...pages,
            query('q', { type: 'string', maxLength: 160 }),
            query('status', {
              enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
            }),
            query('priority', { enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }),
            query('assignment', { enum: ['all', 'mine', 'unassigned'] }),
            query('sort', { enum: ['newest', 'oldest'], default: 'newest' }),
          ],
        },
      ),
      post: operation('Créer un ticket', 'CUSTOMER uniquement', ref('Ticket'), {
        requestBody: body(
          object(
            {
              subject: { type: 'string', minLength: 5, maxLength: 160 },
              description: { type: 'string', minLength: 10, maxLength: 10000 },
            },
            ['subject', 'description'],
          ),
        ),
        responses: { '201': json(ref('Ticket')), ...errorResponses },
      }),
    },
    '/tickets/{id}': {
      get: operation(
        'Détail et conversation',
        'Même contrôle de propriété que la liste. INTERNAL filtré en base pour CUSTOMER.',
        ref('TicketDetail'),
        { parameters: [path()] },
      ),
    },
    '/tickets/{id}/claim': {
      post: operation(
        'Prendre en charge',
        'AGENT ou ADMIN. Ticket non attribué et non fermé.',
        ref('Ticket'),
        { parameters: [path()] },
      ),
    },
    '/tickets/{id}/assignment': {
      patch: operation(
        'Attribuer ou réattribuer',
        'ADMIN. Agent ou administrateur actif, ou null.',
        ref('Ticket'),
        {
          parameters: [path()],
          requestBody: body(
            object({ assignedAgentId: { type: ['string', 'null'], format: 'uuid' } }, [
              'assignedAgentId',
            ]),
          ),
        },
      ),
    },
    '/tickets/{id}/status': {
      patch: operation(
        'Changer le statut',
        'CUSTOMER propriétaire : RESOLVED → CLOSED. AGENT attribué / ADMIN : OPEN → IN_PROGRESS ; IN_PROGRESS → WAITING_FOR_CUSTOMER ou RESOLVED ; WAITING_FOR_CUSTOMER → IN_PROGRESS ou RESOLVED ; RESOLVED → IN_PROGRESS ou CLOSED. CLOSED terminal.',
        ref('Ticket'),
        {
          parameters: [path()],
          requestBody: body(
            object(
              {
                status: {
                  enum: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'],
                },
              },
              ['status'],
            ),
          ),
        },
      ),
    },
    '/tickets/{id}/priority': {
      patch: operation(
        'Changer la priorité',
        'AGENT attribué ou ADMIN. Ticket non fermé.',
        ref('Ticket'),
        {
          parameters: [path()],
          requestBody: body(
            object({ priority: { enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] } }, ['priority']),
          ),
        },
      ),
    },
    '/tickets/{id}/messages': {
      post: operation(
        'Ajouter un message ou une note',
        'CUSTOMER propriétaire : PUBLIC seulement. AGENT attribué ou ADMIN : PUBLIC ou INTERNAL. Ni RESOLVED ni CLOSED.',
        ref('Message'),
        {
          parameters: [path()],
          requestBody: body(
            object(
              {
                content: { type: 'string', minLength: 1, maxLength: 10000 },
                visibility: { enum: ['PUBLIC', 'INTERNAL'], default: 'PUBLIC' },
              },
              ['content'],
            ),
          ),
          responses: { '201': json(ref('Message')), ...errorResponses },
        },
      ),
    },
    '/users': {
      get: operation('Utilisateurs paginés', 'ADMIN uniquement', page('User'), {
        parameters: pages,
      }),
    },
    '/users/{id}': {
      get: operation('Consulter un utilisateur', 'ADMIN uniquement', ref('User'), {
        parameters: [path()],
      }),
      patch: operation(
        'Modifier rôle et/ou état',
        'ADMIN. Protection du dernier administrateur actif, révocation des sessions lors des changements de rôle ou désactivation.',
        ref('User'),
        {
          parameters: [path()],
          requestBody: body({
            ...object({
              role: { enum: ['CUSTOMER', 'AGENT', 'ADMIN'] },
              status: { enum: ['ACTIVE', 'DISABLED'] },
            }),
            minProperties: 1,
          }),
        },
      ),
    },
    '/users/{id}/sessions': {
      delete: operation(
        'Révoquer les sessions d’un utilisateur',
        'ADMIN uniquement',
        {},
        {
          parameters: [path()],
          responses: { '204': { description: 'Sessions révoquées' }, ...errorResponses },
        },
      ),
    },
    '/audit': {
      get: operation(
        'Événements d’audit',
        'ADMIN uniquement. Tri décroissant par date et id.',
        page('AuditEvent'),
        { parameters: pages },
      ),
    },
  },
};
