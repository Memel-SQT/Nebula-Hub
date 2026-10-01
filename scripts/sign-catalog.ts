/**
 * Validates and signs the catalog (rule R03, docs/CATALOG.md).
 *
 *   NEBULA_CATALOG_KEY=<private key path> npx ts-node --transpile-only -O "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/sign-catalog.ts
 *
 * Writes catalog/nebula-catalog.json.sig (base64 Ed25519 signature of the exact file bytes),
 * then re-verifies it with the public key embedded in the Hub, so a key mismatch is caught here
 * rather than on users' machines. The private key path comes from the environment and must be
 * outside the repository.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_PUBLIC_KEY } from '../src/electron/catalog-key';
import { verifyCatalogSignature } from '../src/electron/catalog-signature';
import { validateCatalog } from '../src/shared/catalog';

const repository = path.resolve(__dirname, '..');
const catalogPath = path.join(repository, 'catalog', 'nebula-catalog.json');
const keyPath = process.env.NEBULA_CATALOG_KEY;

if (!keyPath) {
  throw new Error('Set NEBULA_CATALOG_KEY to the private key path (outside the repository).');
}
if (path.resolve(keyPath).toLowerCase().startsWith(repository.toLowerCase() + path.sep)) {
  throw new Error('Refusing a private key stored inside the repository.');
}

const bytes = fs.readFileSync(catalogPath);
const validation = validateCatalog(JSON.parse(bytes.toString('utf8')));
if (!validation.ok) {
  console.error(validation.errors.join('\n'));
  throw new Error('The catalog is invalid: nothing was signed.');
}
for (const app of validation.catalog.apps) {
  for (const asset of [app.icon, ...app.screenshots]) {
    if (!fs.existsSync(path.join(repository, 'catalog', asset))) {
      throw new Error(`Missing asset referenced by ${app.id}: ${asset}`);
    }
  }
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
const signature = crypto.sign(null, bytes, privateKey).toString('base64');
if (!verifyCatalogSignature(bytes, signature, CATALOG_PUBLIC_KEY)) {
  throw new Error('The signature does not verify with the public key embedded in the Hub (src/electron/catalog-key.ts).');
}
fs.writeFileSync(`${catalogPath}.sig`, `${signature}\n`);
console.log(`Signed ${validation.catalog.apps.length} apps -> catalog/nebula-catalog.json.sig`);
