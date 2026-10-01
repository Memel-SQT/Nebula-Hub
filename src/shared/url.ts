/**
 * Only plain https: URLs leave the app through `shell.openExternal` (rule R12). Credentials in
 * the URL are refused: they are a classic way to disguise the real host.
 */
export function isSafeExternalUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0 && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
