import { readFileSync } from 'node:fs';

// npm peut omettre les autres plateformes si le verrou est reconstruit depuis node_modules.
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const nativePackages = ['oxc-parser', '@napi-rs/nice', 'lmdb', 'msgpackr-extract'];
const missing = [];
let checked = 0;

for (const name of nativePackages) {
  const parent = lock.packages[`node_modules/${name}`];
  if (!parent?.optionalDependencies) throw new Error(`Dépendance native non trouvée : ${name}`);
  for (const [binding, version] of Object.entries(parent.optionalDependencies)) {
    const entry = lock.packages[`node_modules/${binding}`];
    if (!entry || entry.version !== version || !entry.integrity)
      missing.push(`${binding}@${version}`);
    checked++;
  }
}

if (missing.length) {
  throw new Error(
    `Verrou npm incomplet pour les plateformes natives :\n${missing.join('\n')}\nVoir docs/ci-troubleshooting.md.`,
  );
}
console.info(`Verrou natif vérifié : ${checked} variantes de plateformes présentes.`);
