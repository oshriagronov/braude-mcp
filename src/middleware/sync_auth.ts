/**
 * Owner-only auth for POST /sync.
 * Compare secrets via SHA-256 + timingSafeEqual so length and value are not leaked.
 */

export function extractSyncToken(request: Request): string {
  const auth = request.headers.get('Authorization') || '';
  if (/^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim();
  }
  return (request.headers.get('X-Sync-Token') || '').trim();
}

export async function isValidSyncToken(provided: string, expected: string | undefined): Promise<boolean> {
  if (!expected || !provided) {
    return false;
  }

  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const a = new Uint8Array(providedHash);
  const b = new Uint8Array(expectedHash);
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
