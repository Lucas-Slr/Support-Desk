# Sécurité : protections et compromis

Ce projet illustre des contrôles testables. Il n’est ni « parfaitement sécurisé » ni destiné à une production sensible sans travail supplémentaire.

## Menaces considérées

Vol d’un token, rejeu du refresh token, JWT forgé ou expiré, accès horizontal aux tickets d’un autre client, accès vertical aux routes admin, élévation de rôle à l’inscription, fuite de notes internes, CSRF sur cookies, XSS persistante dans les messages, abus de connexion et courses concurrentes.

## Mots de passe

Argon2id, mémoire 19 456 Kio, deux itérations et parallélisme 1 ; sel géré par la bibliothèque. Réévaluer le coût sur le serveur cible. Entre 12 et 128 caractères, phrases de passe acceptées, pas de composition arbitraire. Email normalisé par trim + minuscules, index unique en base. Aucun mot de passe ni hash dans les réponses ou audits. La connexion effectue aussi une vérification Argon2 sur un hash factice si le compte n’existe pas et retourne le même message pour mauvais mot de passe, compte absent ou désactivé.

L’inscription renvoie 409 avec un message générique si elle ne peut pas aboutir. **Ce statut, comparé à une inscription réussie, permet encore d’inférer l’existence d’une adresse.** Sans validation email, on ne peut pas rendre ce flux complètement opaque tout en connectant immédiatement le nouveau compte. Une inscription différée à réponse uniforme et confirmation hors bande est une amélioration nécessaire si l’énumération est une menace forte. Aucun endpoint de recherche publique de compte n’existe.

## Access token

JWT signé HS256 par `jose`, valide 10 minutes. Claims : sub, sid, jti, iat, exp, iss, aud ; typ JWT. `jwtVerify` impose l’algorithme autorisé, la signature, l’expiration, l’émetteur, le destinataire et les claims obligatoires. Le secret doit être aléatoire, au moins 32 octets, spécifique à l’environnement. L’API valide sa longueur et refuse les placeholders évidents ; elle ne peut pas mesurer sa vraie entropie.

Le décodage Base64URL permet seulement de lire les claims, sans preuve d’authenticité. Modifier un rôle ou une date dans un token décodé ne produit pas un JWT valide. Le contenu n’est pas chiffré : aucune donnée sensible n’y figure. Le rôle est délibérément absent : utilisateur et session sont relus à chaque appel. Cette lecture supplémentaire permet une révocation immédiate et empêche les droits périmés.

Angular conserve le token dans un champ privé du service Auth, uniquement en mémoire. Aucun stockage local/session/IndexedDB, URL ou cookie lisible par JavaScript. Au rechargement, un initializer attend le renouvellement et `/auth/me` avant d’ouvrir les routes. L’intercepteur attache le Bearer exclusivement aux chemins API de l’application, jamais à une URL externe. Il ignore login/register/refresh.

## Refresh token et rotation

Format `UUID-de-session.secret-aléatoire-base64url`. Le secret contient 32 octets aléatoires. La session stocke SHA-256 du secret, jamais le secret lui-même. SHA-256 convient à un secret uniforme de haute entropie ; il ne conviendrait pas aux mots de passe humains.

Cookie `sd_refresh`, HttpOnly, SameSite=Strict, Path=/api/v1/auth, sans Domain (host-only), date d’expiration absolue à 7 jours. Secure en production ; seule cette propriété est désactivée en HTTP local. La suppression reprend les mêmes attributs. Aucune prolongation glissante de la date limite.

Lors du renouvellement, une transaction PostgreSQL verrouille la session `FOR UPDATE`, contrôle l’empreinte, l’état, l’expiration et l’utilisateur actif, puis remplace le hash et `lastUsedAt`. Le nouvel access token est émis après cette opération. Un secret ne peut être consommé qu’une fois.

Une empreinte différente pour une session encore active entraîne sa révocation et un audit REFRESH_REUSE. La transaction retourne un échec sans lever avant commit, pour ne pas annuler la révocation. Toute réutilisation révoque la session concernée, pas tous les appareils. Un attaquant connaissant l’UUID de session peut donc provoquer sa révocation en envoyant un faux secret ; ce compromis privilégie le confinement. Une amélioration est de conserver les empreintes consommées pour distinguer les replays connus.

Deux rotations simultanées sur le même secret donnent au plus un succès puis révoquent la session. Angular partage un Observable `shareReplay` pendant le renouvellement ; les requêtes en attente reprennent avec le nouveau token. Le rejeu HTTP est limité à une fois, y compris si le second appel échoue. Un refus définitif efface la mémoire et redirige vers la connexion.

La coordination est par onglet. Deux onglets ou la perte d’une réponse réseau peuvent provoquer une déconnexion par la politique stricte de replay. Avant production : coordonner les onglets avec Web Locks/BroadcastChannel sans persister de token, et étudier une stratégie tolérante aux pertes réseau sans ouvrir une fenêtre de rejeu incontrôlée.

## Révocation et comptes

Logout révoque côté base puis efface cookie et mémoire. Logout-all révoque toutes les sessions. DELETE de session vérifie son propriétaire. Les administrateurs peuvent révoquer les sessions tierces. Les JWT liés à une session révoquée sont refusés immédiatement, même avant exp.

Rôle changé ou compte désactivé : sessions révoquées dans la même transaction que l’audit. Le dernier administrateur actif est protégé avec un verrou global transactionnel. Une requête déjà authentifiée et en cours peut terminer pendant une révocation ; la garantie concerne les nouvelles authentifications, pas l’annulation rétroactive d’opérations déjà admises.

## CSRF, CORS et origines

Architecture privilégiée : frontend et API derrière la même origine via proxy `/api`. Liste exacte d’origines autorisées, jamais `*` avec credentials. Login, register, refresh, logout et logout-all imposent un en-tête Origin figurant dans cette liste. Origin absent ou `null` refusé. SameSite=Strict ajoute une barrière contre l’envoi cross-site du cookie. Les mutations des autres routes exigent un Bearer inaccessible à un site tiers ; elles ne s’authentifient pas avec le cookie.

CORS contrôle la lecture dans le navigateur, pas l’authentification et pas tous les envois. L’exigence Origin sert aux flux qui acceptent/utilisent le cookie, y compris le login CSRF. Un client non navigateur peut falsifier Origin, mais il doit toujours posséder les identifiants ou secrets nécessaires. Pas de token CSRF supplémentaire dans cette architecture ; réévaluer si les frontends deviennent cross-site.

## XSS et HTTP

Interpolation Angular pour tous les contenus utilisateurs ; aucune insertion innerHTML, aucun bypass de sanitizer. Pas de HTML riche. HttpOnly empêche de lire le refresh token via JavaScript, mais **une XSS pourrait encore effectuer des actions au nom de l’utilisateur** et lire un access token en mémoire. Éviter la XSS reste indispensable.

Helmet ajoute les en-têtes côté API. Le frontend de production doit recevoir sa propre CSP, HSTS et les en-têtes adaptés depuis son serveur statique/reverse proxy ; les en-têtes de l’API ne protègent pas automatiquement les pages Angular. HTTPS doit être imposé en production. Ne pas modifier `trust proxy` sans connaître précisément le réseau de confiance.

Corps JSON limités à 32 Kio, schémas Zod stricts, tailles bornées, ORM paramétré et seules requêtes SQL brutes paramétrées. Erreurs sans stack/SQL/secrets. RequestId généré côté serveur. Cache-Control no-store sur l’API. Swagger local uniquement.

## Limites de requêtes et audit

300 requêtes/minute/IP pour l’API ; inscription 10/15 minutes/IP ; connexion 15/15 minutes/IP ; refresh 60/minute/IP. Réponses 429 stables. Le compteur est en mémoire, par processus. Pas de distribution multi-instance, de limitation par compte ni d’analyse des attaques distribuées. Les reverse proxies doivent préserver une attribution IP fiable avant adaptation.

Tous les échecs de connexion atteignant le contrôleur sont audités anonymement, sans email ni mot de passe, ce qui inclut les échecs répétés avant limitation. Sont également audités succès, révocations, logout global, rôles/états, attribution, notes internes (sans contenu), transitions et réutilisation de refresh. Les erreurs serveur ne journalisent que le type d’événement et le requestId. Pas de journal HTTP des en-têtes/corps. Pas d’adresse IP conservée en base ; userAgent limité à 256 caractères, affiché comme texte non fiable.

## Contrôles d’accès

L’authentification établit l’identité, l’autorisation contrôle l’opération et la ressource. Le backend cumule rôle et propriété. Le client ne peut jamais choisir son rôle, priorité ou propriétaire. Notes internes filtrées dans la requête en base. Listes et totaux partagent le même périmètre SQL. Les guards Angular améliorent la navigation et ne remplacent aucun contrôle API.

401 : authentification absente/invalide, compte désactivé ou session non active. 403 : identité valide sans droit (ou origine CSRF invalide). Les réponses 403 n’incluent pas le ticket interdit. La distinction 403/404 révèle l’existence d’un UUID connu ; voir la matrice.

## Avant une exploitation réelle

Revue indépendante, analyse de dépendances continue, HTTPS/proxy/CSP vérifiés, secrets via un gestionnaire dédié avec rotation, séparation des comptes DB, sauvegardes/restauration testées, rétention des sessions et audits, alertes, suppression/anonymisation conforme aux besoins, rate limiting partagé, vérification email, récupération de compte, MFA pour l’administration, coordination multi-onglets et limitation/pagination des conversations. Le JWT symétrique unique simplifie le projet ; une rotation de clés avec kid et signature asymétrique serait pertinente en architecture plus large.

Les tests automatisés démontrent les scénarios décrits ; ils ne constituent pas un audit exhaustif ni une preuve de sécurité de tout déploiement.
