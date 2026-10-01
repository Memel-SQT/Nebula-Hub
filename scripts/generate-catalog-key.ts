/**
 * Generates the Ed25519 key pair that signs the catalog (docs/CATALOG.md).
 *
 *   npx ts-node --transpile-only -O "{\"module\":\"commonjs\",\"moduleResolution\":\"node\"}" scripts/generate-catalog-key.ts <private key path>
 *
 * The private key is written with owner-only intent, OUTSIDE the repository (refused inside),
 * and never overwritten. The public key is printed: paste it into src/electron/catalog-key.ts.
 * Losing the private key means no new catalog can be signed until a Hub release ships a new
 * public key; back it up offline.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  throw new Error('Usage: generate-catalog-key.ts <private key path, outside the repository>');
}
const repository = path.resolve(__dirname, '..');
const resolved = path.resolve(target);
if (resolved.toLowerCase().startsWith(repository.toLowerCase() + path.sep)) {
  throw new Error('Refusing to write the private key inside the repository.');
}
if (fs.existsSync(resolved)) {
  throw new Error(`Refusing to overwrite an existing key: ${resolved}`);
}
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(path.dirname(resolved), { recursive: true });
fs.writeFileSync(resolved, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600, flag: 'wx' });
console.log(`Private key written to ${resolved}`);
console.log(publicKey.export({ type: 'spki', format: 'pem' }));
