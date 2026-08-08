import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('Braude MCP Server Adversarial Edge-Case Suite', () => {
  describe('1. Payload Structural Edge Cases', () => {
    it('1.1 Empty JSON object {} returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBeNull();
      expect(data.error?.code).toBe(-32600);
    });

    it('1.2 Number payload 123 returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '123',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('1.3 String payload "hello" returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '"hello"',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('1.4 Boolean payload true returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'true',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('1.5 JSON null payload returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('1.6 JSON Array payload [1,2,3] returns -32600 Invalid Request', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[1, 2, 3]',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });
  });

  describe('2. Header & Content-Type Edge Cases', () => {
    it('2.1 Content-Type: text/plain returns 400 Parse Error (-32700)', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32700);
      expect(data.error?.message).toContain('Content-Type header must be application/json');
    });

    it('2.2 Content-Type: application/json; charset=utf-8 is accepted', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result).toBeDefined();
    });

    it('2.3 Omitted Content-Type header (defaults to text/plain in fetch) returns 400 Parse Error', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        body: '{"jsonrpc":"2.0","id":99,"method":"ping"}',
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32700);
    });
  });

  describe('3. JSON-RPC Protocol Fields Edge Cases', () => {
    it('3.1 Invalid jsonrpc version "1.0" returns -32600', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"1.0","id":1,"method":"ping"}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('3.2 Number jsonrpc field 2 returns -32600', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":2.0,"id":1,"method":"ping"}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('3.3 Non-string method (number) returns -32600', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":1,"method":12345}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('3.4 Non-string method (object) returns -32600', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":1,"method":{"name":"ping"}}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32600);
    });

    it('3.5 Object property prototype pollution attempts on method name return -32601', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":1,"method":"toString"}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32601);
    });

    it('3.6 Preservation of id types (string, number, string-uuid)', async () => {
      const resNum = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":0,"method":"ping"}',
      });
      expect((await resNum.json() as any).id).toBe(0);

      const resStr = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":"abc-123","method":"ping"}',
      });
      expect((await resStr.json() as any).id).toBe('abc-123');
    });
  });

  describe('4. Tool & Resource Invocation Edge Cases', () => {
    it('4.1 tools/call without params returns -32601 Tool not found', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":10,"method":"tools/call"}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32601);
    });

    it('4.2 tools/call with invalid tool name returns -32601 Tool not found', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"nonexistent_tool"}}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32601);
      expect(data.error?.message).toContain('nonexistent_tool');
    });

    it('4.3 tools/call with valid tool and nested complex arguments returns 200 success response', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: {
            query: 'אלגברה',
            department: 'Software Engineering',
            extraFilters: { semester: 'A', year: 2025, tags: ['required', 'math'] },
          },
        },
      };
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result?.content).toBeDefined();
      expect(data.result.isError).toBe(false);
      const contentText = data.result.content[0].text;
      const parsed = JSON.parse(contentText);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('4.4 resources/read with missing uri returns -32602 Invalid params', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":13,"method":"resources/read","params":{}}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32602);
    });

    it('4.5 resources/read with unknown uri returns -32602 Invalid params', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":14,"method":"resources/read","params":{"uri":"braude://unknown/path"}}',
      });
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe(-32602);
    });

    it('4.6 resources/read with valid uri returns resource stub', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"jsonrpc":"2.0","id":15,"method":"resources/read","params":{"uri":"braude://calendar/current"}}',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result?.contents).toBeDefined();
      expect(data.result.contents[0].uri).toBe('braude://calendar/current');
    });
  });

  describe('5. Unsupported HTTP Methods', () => {
    it('5.1 GET /mcp returns 404', async () => {
      const res = await doFetch('/mcp', { method: 'GET' });
      expect(res.status).toBe(404);
    });

    it('5.2 PUT /mcp returns 404', async () => {
      const res = await doFetch('/mcp', { method: 'PUT' });
      expect(res.status).toBe(404);
    });
  });
});
