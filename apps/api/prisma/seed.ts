import 'dotenv/config';
import { db } from '../src/database/client.js';
import { hashPassword } from '../src/modules/auth/service.js';
import { password } from '../src/shared/validation.js';
if (process.env.NODE_ENV === 'production') throw new Error('Seed interdit en production');
const pass = password.parse(process.env.DEMO_PASSWORD);
if (pass.includes('REPLACE')) throw new Error('Choisir DEMO_PASSWORD dans .env');
const passwordHash = await hashPassword(pass);
const accounts = [
  ['admin@support.local', 'Alex Morgan', 'ADMIN'],
  ['agent@support.local', 'Sam Dubois', 'AGENT'],
  ['client@support.local', 'Camille Martin', 'CUSTOMER'],
  ['client2@support.local', 'Jordan Petit', 'CUSTOMER'],
] as const;
const users = [];
for (const [email, displayName, role] of accounts)
  users.push(
    await db.user.upsert({
      where: { email },
      update: {},
      create: { email, displayName, role, passwordHash },
    }),
  );
const [admin, agent, client, other] = users;
if (!admin || !agent || !client || !other) throw new Error('Seed incomplet');
if (!(await db.ticket.count())) {
  const fixtures = [
    [
      'Impossible d’accéder à mon espace',
      'Depuis ce matin, la page de connexion reste bloquée après validation.',
      'IN_PROGRESS',
      'HIGH',
      agent.id,
      client.id,
    ],
    [
      'Mettre à jour les informations de facturation',
      'Je souhaite modifier l’adresse indiquée sur ma prochaine facture.',
      'WAITING_FOR_CUSTOMER',
      'MEDIUM',
      agent.id,
      client.id,
    ],
    [
      'Une question sur mon abonnement',
      'Pouvez-vous me préciser les options disponibles dans mon offre actuelle ?',
      'OPEN',
      'LOW',
      null,
      client.id,
    ],
    [
      'Export de mes données au format CSV',
      'Merci pour votre aide, le fichier exporté contient maintenant toutes les colonnes.',
      'RESOLVED',
      'MEDIUM',
      agent.id,
      client.id,
    ],
    [
      'Notification reçue en double',
      'Je reçois deux notifications identiques pour chaque nouvelle activité.',
      'OPEN',
      'MEDIUM',
      null,
      other.id,
    ],
    [
      'Configuration de l’accès à distance',
      'La configuration de mon accès à distance ne fonctionne pas sur mon ordinateur.',
      'IN_PROGRESS',
      'URGENT',
      admin.id,
      other.id,
    ],
  ] as const;
  for (const [subject, description, status, priority, assignedAgentId, authorId] of fixtures) {
    const t = await db.ticket.create({
      data: {
        subject,
        description,
        status,
        priority,
        assignedAgentId,
        authorId,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
      },
    });
    await db.ticketMessage.create({
      data: {
        ticketId: t.id,
        authorId: agent.id,
        content: 'Bonjour, nous avons bien reçu votre demande et revenons vers vous rapidement.',
        visibility: 'PUBLIC',
      },
    });
    await db.ticketMessage.create({
      data: {
        ticketId: t.id,
        authorId: agent.id,
        content: 'Vérifier la configuration avec l’équipe technique avant de répondre.',
        visibility: 'INTERNAL',
      },
    });
  }
  await db.auditEvent.create({
    data: { actorId: admin.id, action: 'DEMO_SEEDED', targetType: 'System' },
  });
}
console.info('Données de démonstration prêtes. Aucun mot de passe affiché.');
await db.$disconnect();
