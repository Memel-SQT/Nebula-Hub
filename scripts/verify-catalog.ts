/**
 * Checks, without any private key, that catalog/nebula-catalog.json is valid and that its
 * signature verifies with the public key embedded in the Hub. Run by the release workflow so a
 * release can never ship a catalog that every Hub would reject (R03).
 *
 *   npm run catalog:verify
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATALOG_PUBLIC_KEY } from '../src/electron/catalog-key';
import { verifyCatalogSignature } from '../src/electron/catalog-signature';
import { validateCatalog } from '../src/shared/catalog';

const catalogPath = path.join(__dirname, '..', 'catalog', 'nebula-catalog.json');
const bytes = fs.readFileSync(catalogPath);
const signature = fs.readFileSync(`${catalogPath}.sig`, 'utf8');

const validation = validateCatalog(JSON.parse(bytes.toString('utf8')));
if (!validation.ok) {
  console.error(validation.errors.join('\n'));
  throw new Error('The catalog is invalid.');
}
if (!verifyCatalogSignature(bytes, signature, CATALOG_PUBLIC_KEY)) {
  throw new Error('The catalog signature does not verify with the embedded public key: run `npm run catalog:sign`.');
}
console.log(`Catalog OK: ${validation.catalog.apps.length} apps, generated ${validation.catalog.generatedAt}, signature valid.`);
