/**
 * Public half of the catalog signing key (Ed25519, rule R03), embedded in every Hub build.
 * The private half is never in the repository (docs/CATALOG.md). Rotating it means shipping a
 * Hub release with the new public key before signing with the new private key.
 */
export const CATALOG_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAs5J9kn8j5VTIYn7YvjNKyU5ddIK69RgqnN3mVBv/VUQ=
-----END PUBLIC KEY-----
`;
