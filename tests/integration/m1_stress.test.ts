import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('M1 Empirical Stress Test Suite — CORS, Error Codes, Concurrency', () => {
  // ==========================================
  // Section 1: CORS & HTTP Header Verification
  // ==========================================
  describe('1. CORS & Preflight Verification', () => {
    it('1.1 OPTIONS /mcp preflight returns expected CORS headers', async () => {
      const res = await doFetch('/mcp', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://client.example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Mcp-Version',
        },
      });

      expect([200, 204]).toContain(res.status);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
      expect(res.headers.get('access-control-max-age')).toBe('86400');
    });

    it('1.2 POST /mcp response includes CORS headers even on 200 success', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: {
          Origin: 'https://app.example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
      expect(res.headers.get('access-control-expose-headers')).toContain('Content-Type');
    });

    it('1.3 POST /mcp response includes CORS headers on 400 Bad Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: {
          Origin: 'https://app.example.com',
          'Content-Type': 'application/json',
        },
        body: '{ malformed json',
      });

      expect(res.status).toBe(400);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('1.4 OPTIONS /health preflight returns CORS headers', async () => {
      const res = await doFetch('/health', {
        method: 'OPTIONS',
        headers: { Origin: 'https://app.example.com' },
      });

      expect([200, 204]).toContain(res.status);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('1.5 Disallowed methods (e.g., PUT /mcp, DELETE /mcp) handle CORS & return 404 or 405', async () => {
      const putRes = await doFetch('/mcp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect([404, 405]).toContain(putRes.status);
      expect(putRes.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  // ==========================================
  // Section 2: Error Codes & JSON-RPC Payloads
  // ==========================================
  describe('2. Error Codes & Payload Structures', () => {
    it('2.1 Non-JSON Content-Type header returns HTTP 400 with -32700', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBeNull();
      expect(data.error.code).toBe(-32700);
      expect(data.error.message).toContain('Content-Type');
    });

    it('2.2 Malformed JSON body returns HTTP 400 with -32700', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc": "2.0", "id": 1, "method":',
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBeNull();
      expect(data.error.code).toBe(-32700);
      expect(data.error.message).toContain('Invalid JSON payload');
    });

    it('2.3 Non-object primitive payload (number, string, boolean, null) returns -32600', async () => {
      const primitives = [123, 'hello', true, null];
      for (const prim of primitives) {
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prim),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBeNull();
        expect(data.error.code).toBe(-32600);
        expect(data.error.message).toContain('Payload must be an object');
      }
    });

    it('2.4 Array payload (Batch request) returns -32600 since single object expected', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBeNull();
      expect(data.error.code).toBe(-32600);
    });

    it('2.5 Missing or invalid jsonrpc version returns -32600 and preserves request id', async () => {
      const res1 = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 99, method: 'ping' }),
      });
      const data1 = (await res1.json()) as any;
      expect(data1.id).toBe(99);
      expect(data1.error.code).toBe(-32600);

      const res2 = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '1.0', id: 'req-abc', method: 'ping' }),
      });
      const data2 = (await res2.json()) as any;
      expect(data2.id).toBe('req-abc');
      expect(data2.error.code).toBe(-32600);
    });

    it('2.6 Missing method or non-string method returns -32600 and preserves request id', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 42, method: 12345 }),
      });

      const data = (await res.json()) as any;
      expect(data.id).toBe(42);
      expect(data.error.code).toBe(-32600);
      expect(data.error.message).toContain('method is required');
    });

    it('2.7 Non-existent method returns -32601 and preserves request id', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 777, method: 'custom/unknown' }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.id).toBe(777);
      expect(data.error.code).toBe(-32601);
      expect(data.error.message).toBe('Method not found: "custom/unknown"');
    });

    it('2.8 Tools/call with unknown tool name returns -32601', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 888,
          method: 'tools/call',
          params: { name: 'non_existent_tool', arguments: {} },
        }),
      });

      const data = (await res.json()) as any;
      expect(data.id).toBe(888);
      expect(data.error.code).toBe(-32601);
      expect(data.error.message).toBe('Tool not found: "non_existent_tool"');
    });

    it('2.9 Resources/read with unknown or missing URI returns -32602', async () => {
      const resMissing = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 901,
          method: 'resources/read',
          params: {},
        }),
      });
      const dataMissing = (await resMissing.json()) as any;
      expect(dataMissing.id).toBe(901);
      expect(dataMissing.error.code).toBe(-32602);

      const resInvalid = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 902,
          method: 'resources/read',
          params: { uri: 'braude://calendar/invalid' },
        }),
      });
      const dataInvalid = (await resInvalid.json()) as any;
      expect(dataInvalid.id).toBe(902);
      expect(dataInvalid.error.code).toBe(-32602);
    });
  });

  // ==========================================
  // Section 3: High Concurrency & Stress Tests
  // ==========================================
  describe('3. High Concurrency & Load Stress', () => {
    it('3.1 100 simultaneous concurrent POST /mcp requests succeed without failure', async () => {
      const CONCURRENCY = 100;
      const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
        doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 1,
            method: i % 2 === 0 ? 'tools/list' : 'initialize',
          }),
        })
      );

      const startTime = performance.now();
      const responses = await Promise.all(promises);
      const endTime = performance.now();

      expect(responses.length).toBe(CONCURRENCY);
      for (let i = 0; i < CONCURRENCY; i++) {
        const res = responses[i];
        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.id).toBe(i + 1);
        expect(data.result).toBeDefined();
      }

      console.log(`[STRESS] 100 concurrent requests completed in ${(endTime - startTime).toFixed(2)} ms`);
    });

    it('3.2 500 simultaneous concurrent POST /mcp requests of mixed methods', async () => {
      const CONCURRENCY = 500;
      const methods = ['initialize', 'tools/list', 'resources/list', 'ping', 'tools/call'];
      
      const startMemory = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const method = methods[i % methods.length];
        const params = method === 'tools/call' ? { name: 'get_academic_calendar', arguments: { year: '2024-2025' } } : {};
        return doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 1000,
            method,
            params,
          }),
        });
      });

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      expect(responses.length).toBe(CONCURRENCY);
      let successCount = 0;

      for (let i = 0; i < CONCURRENCY; i++) {
        const res = responses[i];
        if (res.status === 200) {
          const data = (await res.json()) as any;
          if (data.id === i + 1000 && data.result) {
            successCount++;
          }
        }
      }

      expect(successCount).toBe(CONCURRENCY);
      console.log(`[STRESS] 500 mixed concurrent requests: ${successCount}/${CONCURRENCY} passed in ${(endTime - startTime).toFixed(2)} ms. Memory delta: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
    });

    it('3.3 1000 rapid sequential POST /mcp requests', async () => {
      const COUNT = 1000;
      const startTime = performance.now();

      for (let i = 0; i < COUNT; i++) {
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            method: 'ping',
          }),
        });
        expect(res.status).toBe(200);
      }

      const endTime = performance.now();
      const avgDuration = (endTime - startTime) / COUNT;
      console.log(`[STRESS] 1000 sequential requests completed in ${(endTime - startTime).toFixed(2)} ms (Avg: ${avgDuration.toFixed(3)} ms/req)`);
      expect(avgDuration).toBeLessThan(10);
    });
  });
});
