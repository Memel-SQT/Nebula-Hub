import crypto from 'node:crypto';

/**
 * Ed25519 signature of the catalog (rule R03), with node:crypto only (no third-party crypto).
 * The signature covers the exact bytes of `nebula-catalog.json`; `nebula-catalog.json.sig`
 * holds the 64-byte signature in base64 (one line). See docs/CATALOG.md.
 */
const SIGNATURE_FORMAT = /^([A-Za-z0-9+/]{86}==)\s*$/;

export function verifyCatalogSignature(data: Uint8Array, signatureText: string, publicKeyPem: string): boolean {
  const match = SIGNATURE_FORMAT.exec(signatureText);
  if (!match) {
    return false;
  }
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') {
      return false;
    }
    return crypto.verify(null, data, key, Buffer.from(match[1], 'base64'));
  } catch {
    return false;
  }
}

/** SHA-256 of the public key (SPKI DER), shown in Settings so the user can compare it with the docs. */
export function publicKeyFingerprint(publicKeyPem: string): string {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const hex = crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
}
