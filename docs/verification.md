# Validation locale — 29 septembre 2026

Vérifications exécutées sur Windows, Node.js 24.15.0 et npm 11.12.1, dans `C:\DEV\support-desk`.

## Résultats

| Vérification                | Résultat observé                                                          |
| --------------------------- | ------------------------------------------------------------------------- |
| PostgreSQL local            | Démarré sur 127.0.0.1:55432, bases développement et test distinctes       |
| Migration initiale          | Appliquée aux deux bases ; second passage sans migration en attente       |
| Seed                        | Quatre comptes et six tickets initiaux, messages publics et internes      |
| API Express                 | Démarrée sur 127.0.0.1:3100                                               |
| Frontend Angular            | Démarré sur localhost:4200                                                |
| Swagger                     | Interface et opérations chargées dans Chromium                            |
| Tests backend               | **30 / 30 réussis**                                                       |
| Tests frontend              | **18 / 18 réussis**                                                       |
| Playwright                  | **5 / 5 réussis**                                                         |
| ESLint                      | Réussi, aucune erreur                                                     |
| Prettier                    | Tous les fichiers vérifiés conformes                                      |
| TypeScript / Angular strict | Réussi pour les deux applications                                         |
| Builds de production        | API et Angular réussis                                                    |
| Bundle Angular initial      | Environ 298 ko bruts, 82 ko transférés estimés                            |
| Audit npm                   | **0 vulnérabilité signalée** au moment de la vérification                 |
| Exclusion Git               | .env, secrets locaux, données PostgreSQL, dépendances et rapports ignorés |

## Scénarios réellement vérifiés

Backend : inscription et normalisation, refus de rôle public, doublon, mot de passe invalide, connexion et erreurs génériques ; JWT absent, valide, expiré, mal signé, mauvais algorithme, mauvais émetteur, mauvais destinataire ou claims manquants ; renouvellement, rotation, replay, révocation, expiration de session, compte désactivé, déconnexion simple/globale et origines étrangères/absentes.

Autorisations : listes et compteurs filtrés, recherche, UUID connu appartenant à un autre client, agent face au ticket d’un autre agent, prise en charge préalable, refus des routes administratives, protection du dernier administrateur, révocation d’une session tierce, absence de hash et de notes internes dans les réponses client. Tests concurrents sur rotation, prise en charge et rétrogradation des administrateurs.

Frontend : validation inscription/connexion, tokens en mémoire, initialisation, Bearer limité à l’API, renouvellement partagé, attente des nouveaux appels, ancien 401 tardif, rejeu unique, échec définitif, conservation d’une session valide après 403, guards et messages d’erreur 401/403/409/429.

Playwright : inscription puis reconnexion d’un client, création de ticket, prise en charge et réponse d’un agent, note interne distincte et absente du JSON client, résolution et fermeture ; changement de rôle par un administrateur et invalidation des sessions ; révocation personnelle ; refus d’administration pour un client ; absence de stockage persistant des tokens et cookie invisible au JavaScript ; mobile 390 × 844 sans débordement global ; Swagger ; analyse axe-core WCAG A/AA de la connexion et du tableau de bord desktop/mobile. Captures desktop et mobile inspectées pendant le développement.

## Corrections issues des vérifications

- Isolation des limiteurs entre instances Express de test, en conservant les limites réelles.
- Conversion textuelle du résultat du verrou consultatif PostgreSQL pour compatibilité Prisma.
- Port API 3100 afin de ne pas entrer en conflit avec une autre application locale sur 3000.
- Icônes décoratives exclues des libellés accessibles des liens.
- Correction du débordement mobile lié à un libellé visuellement masqué dans le tableau.
- Contrastes renforcés sur textes secondaires et badges.
- Gestion des 401 tardifs, attente pendant renouvellement et distinction d’un 403 après rejeu.
- Correctifs transitifs du CLI Prisma via overrides npm, puis génération et migrations revérifiées.

## Limites de cette validation

Docker et psql ne sont pas installés sur cette machine : le fichier Compose est fourni, mais son lancement local n’a pas été exécuté. Les vérifications utilisent un véritable PostgreSQL démarré par l’outil de développement `embedded-postgres`.

Le workflow GitHub Actions est créé mais n’a pas été exécuté sur GitHub : aucun dépôt distant ni publication n’a été demandé. Les builds sont validés ; aucun hébergement de production ni reverse proxy HTTPS n’a été déployé.

Les tests navigateur ont été exécutés sur Chromium, pas Firefox ou WebKit. Axe-core couvre certaines erreurs détectables automatiquement sur les pages testées ; il ne certifie pas une conformité WCAG globale. Les tests ne remplacent pas une revue indépendante ni des essais de charge. Les limites fonctionnelles et de sécurité sont détaillées dans `security.md`.

Les tests E2E ajoutent des comptes et tickets de test dans l’instance locale utilisée. Les captures et rapports sont ignorés par Git. Les tests HTTP utilisent et nettoient uniquement la base `support_desk_test`.
