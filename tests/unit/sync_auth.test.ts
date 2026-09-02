import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import { extractSyncToken, isValidSyncToken } from '../../src/middleware/sync_auth.js';

describe('POST /sync owner auth', () => {
  it('extracts Bearer tokens and X-Sync-Token', () => {
    const bearer = new Request('http://localhost/sync', {
      headers: { Authorization: 'Bearer secret-value' },
    });
    expect(extractSyncToken(bearer)).toBe('secret-value');

    const header = new Request('http://localhost/sync', {
      headers: { 'X-Sync-Token': 'header-secret' },
    });
    expect(extractSyncToken(header)).toBe('header-secret');
  });

  it('accepts a matching token and rejects a wrong one', async () => {
    expect(await isValidSyncToken('correct-token', 'correct-token')).toBe(true);
    expect(await isValidSyncToken('wrong-token', 'correct-token')).toBe(false);
    expect(await isValidSyncToken('', 'correct-token')).toBe(false);
    expect(await isValidSyncToken('correct-token', '')).toBe(false);
    expect(await isValidSyncToken('correct-token', undefined)).toBe(false);
  });

  it('rejects POST /sync without a token', async () => {
    const res = await app.fetch(new Request('http://localhost/sync', { method: 'POST' }), {
      SYNC_SECRET: 'owner-secret',
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('Unauthorized');
  });

  it('rejects POST /sync with a wrong token', async () => {
    const res = await app.fetch(
      new Request('http://localhost/sync', {
        method: 'POST',
        headers: { Authorization: 'Bearer no-match' },
      }),
      { SYNC_SECRET: 'owner-secret' }
    );
    expect(res.status).toBe(401);
  });
});
