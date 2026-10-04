# Dépannage de la CI

## Symptôme

Les tests API passent, puis `ng test` échoue pendant la compilation avec `Cannot find native binding` et `Cannot find module '@oxc-parser/binding-linux-x64-gnu'` sur Ubuntu.

Le verrou npm initial contenait la variante Windows de `oxc-parser`, mais pas celles des autres plateformes. Le même problème touchait `@napi-rs/nice`, `lmdb` et `msgpackr-extract`. Une installation Windows réussie ne détectait pas cette omission. Le comportement est décrit dans le [ticket npm #4828](https://github.com/npm/cli/issues/4828).

## Correction

Les entrées optionnelles manquantes ont été rétablies avec leurs versions exactes, URLs et empreintes d’intégrité issues du registre npm. Aucune version précédemment verrouillée n’a été modifiée. Il faut committer **package-lock.json**, puis pousser le correctif pour que GitHub Actions utilise ce nouveau verrou. Relancer l’ancien commit reproduirait le problème.

La CI vérifie maintenant les variantes natives avant `npm ci --include=optional`, puis importe `oxc-parser` sur le runner pour vérifier que son composant natif est utilisable. Les tests backend et frontend sont présentés dans deux étapes distinctes. L’option `--include=optional` ne répare pas à elle seule un verrou incomplet.

## Prévention

```sh
node scripts/check-native-lock.mjs
```

Ne pas supprimer seulement `package-lock.json` puis le régénérer avec un ancien dossier `node_modules` présent. Pour reconstruire un verrou, travailler dans un dossier propre contenant les manifestes des workspaces, sans `node_modules`, puis examiner le diff et les variantes de plateformes. Conserver le verrou corrigé et employer `npm ci` dans la CI ; ne pas ajouter une installation ad hoc de la dernière version du binaire Linux, qui pourrait ne pas correspondre à celle du parseur.

L’avertissement relatif au runtime Node.js des actions checkout/setup-node est distinct de cette panne de dépendance native.

## Vérifications du correctif — 4 octobre 2026

- 45 entrées natives ajoutées ; les 747 entrées existantes sont inchangées.
- Le contrôle détecte l’ancien verrou incomplet et accepte le verrou corrigé (49 variantes).
- Installation propre avec `npm ci --ignore-scripts --include=optional --os=linux --cpu=x64 --libc=glibc` dans un dossier temporaire : réussie ; présence du binaire ELF Linux de `oxc-parser` vérifiée.
- Sous Windows, les 18 tests Angular avec `CI=true`, le build Angular, ESLint et Prettier passent.

L’installation ciblée vérifie la résolution et le téléchargement des dépendances Linux ; elle n’exécute pas leurs binaires sous Windows. Le job Ubuntu complet reste à confirmer sur GitHub après publication du correctif.

## Timeout Playwright au démarrage des serveurs

Symptôme : les étapes précédentes passent, puis `npm run test:e2e` signale que le port 3100 est occupé et dépasse les 60 secondes d’attente de `config.webServer`.

La variable `PORT=3100` était définie pour tout le job. Angular donne priorité à cette variable sur l’option `--port 4200` : le frontend essayait donc de démarrer sur le port de l’API, alors que Playwright l’attendait sur 4200. Le message concernant le prebundling désactivé est informatif.

Le port global a été retiré du workflow. `playwright.config.ts` fournit explicitement `PORT=3100` et `HOST=127.0.0.1` au processus API, et `PORT=4200` au processus Angular. Le contrôle de santé API utilise `127.0.0.1`, comme son adresse d’écoute et la cible du proxy ; il ne dépend plus de la résolution IPv4/IPv6 de localhost. Les sorties de démarrage sont affichées pour faciliter les diagnostics.

Pour vérifier l’isolation des ports, lancer les E2E sans serveurs API/Angular préexistants, avec `CI=true`, `NODE_ENV=test` et même un `PORT=3100` hérité : Playwright doit lancer chaque serveur sur son propre port. PostgreSQL et les données de démonstration doivent être disponibles. Augmenter le timeout ne corrigerait pas ce conflit d’adresse.

Vérification locale du 4 octobre 2026 : les 5 tests E2E passent en 23 secondes dans ces conditions sous Windows ; les logs confirment l’API sur 127.0.0.1:3100 et Angular sur localhost:4200. ESLint et le formatage passent également. L’exécution Ubuntu complète reste à confirmer après le push.
