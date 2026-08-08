import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import type { AcademicCalendarData } from '../../src/types/index.js';

const TEST_ENDPOINT = process.env.TEST_ENDPOINT;

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  if (TEST_ENDPOINT) {
    const url = new URL(path, TEST_ENDPOINT).toString();
    return fetch(url, options);
  }
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('Academic Calendar MCP Integration Suite (M2)', () => {
  describe('Tool: get_academic_calendar', () => {
    it('1.1 executes get_academic_calendar without parameters successfully', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 101,
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: {},
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(101);
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content[0].type).toBe('text');

      const calendarData = JSON.parse(data.result.content[0].text) as AcademicCalendarData;
      expect(calendarData.sourceUrl).toContain('braude.ac.il');
      expect(Array.isArray(calendarData.years)).toBe(true);
    });

    it('1.2 executes get_academic_calendar with valid year parameter', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 102,
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: {
            year: '2025-2026',
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
      expect(data.result.isError).toBe(false);
      const calendarData = JSON.parse(data.result.content[0].text) as AcademicCalendarData;
      expect(
        calendarData.years.every(
          (y) => y.academicYear.includes('2025-2026') || y.academicYear.includes('תשפ"ו')
        )
      ).toBe(true);
    });

    it('1.3 handles get_academic_calendar with unknown year gracefully', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 103,
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: {
            year: '1900-1901',
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
      expect(data.result.isError).toBe(false);
      const calendarData = JSON.parse(data.result.content[0].text) as AcademicCalendarData;
      expect(calendarData.years).toHaveLength(0);
    });
  });

  describe('Resource: braude://calendar/current', () => {
    it('2.1 reads braude://calendar/current successfully', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 201,
        method: 'resources/read',
        params: {
          uri: 'braude://calendar/current',
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(201);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.contents)).toBe(true);
      expect(data.result.contents[0].uri).toBe('braude://calendar/current');
      expect(data.result.contents[0].mimeType).toBe('application/json');

      const calendarContent = JSON.parse(data.result.contents[0].text);
      expect(calendarContent).toBeDefined();
    });

    it('2.2 returns -32602 error for non-existent calendar resource URI', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 202,
        method: 'resources/read',
        params: {
          uri: 'braude://calendar/non_existent_resource',
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(202);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32602);
    });
  });
});
