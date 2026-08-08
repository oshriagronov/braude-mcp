import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import type { CourseSummary, CourseScheduleDetail } from '../../src/types/index.js';

const TEST_ENDPOINT = process.env.TEST_ENDPOINT;

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  if (TEST_ENDPOINT) {
    const url = new URL(path, TEST_ENDPOINT).toString();
    return fetch(url, options);
  }
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('M3 Empirical Challenger Stress & Edge Case Harness', () => {

  describe('1. Empty Strings & Whitespace Queries', () => {
    it('1.1 search_courses with empty string query', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-1.1',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: '' },
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
      expect(data.id).toBe('stress-1.1');
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/cannot be empty/i);
    });

    it('1.2 search_courses with whitespace-only query', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-1.2',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: '   \t\n  ' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/cannot be empty/i);
    });

    it('1.3 get_course_schedule with empty string courseCode', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-1.3',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: '' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/cannot be empty/i);
    });

    it('1.4 get_course_schedule with whitespace-only courseCode', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-1.4',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: '   ' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/cannot be empty/i);
    });
  });

  describe('2. Numeric String Edge Cases', () => {
    it('2.1 search_courses with valid numeric course code string "61767"', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-2.1',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: '61767' },
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
      const courses = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(Array.isArray(courses)).toBe(true);
      expect(courses.some((c) => c.courseCode === '61767')).toBe(true);
    });

    it('2.2 get_course_schedule with numeric type instead of string for courseCode', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-2.2',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: 61767 },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/must be a string/i);
    });

    it('2.3 search_courses with numeric type query instead of string', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-2.3',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: 61767 },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/must be a string/i);
    });
  });

  describe('3. Long Keywords', () => {
    it('3.1 search_courses with 1000-character long query', async () => {
      const longQuery = 'אבטחה'.repeat(200);
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-3.1',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: longQuery },
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
      const results = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(Array.isArray(results)).toBe(true);
    });

    it('3.2 get_course_schedule with 1000-character long courseCode', async () => {
      const longCode = '9'.repeat(1000);
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-3.2',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: longCode },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
    });
  });

  describe('4. Missing Parameters', () => {
    it('4.1 search_courses with missing query parameter object', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-4.1',
        method: 'tools/call',
        params: {
          name: 'search_courses',
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
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/parameter is required/i);
    });

    it('4.2 get_course_schedule with missing courseCode parameter object', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-4.2',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
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
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/parameter is required/i);
    });

    it('4.3 tools/call missing params.name parameter', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-4.3',
        method: 'tools/call',
        params: {
          arguments: { query: 'test' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
    });
  });

  describe('5. Invalid JSON-RPC Method Names', () => {
    it('5.1 unknown method "tools/invalid_method"', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-5.1',
        method: 'tools/invalid_method',
        params: {},
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
      expect(data.error.message).toMatch(/Method not found/i);
    });

    it('5.2 calling tool name directly as JSON-RPC method "search_courses"', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-5.2',
        method: 'search_courses',
        params: { query: '61767' },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
    });

    it('5.3 non-string method', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-5.3',
        method: 12345,
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600);
    });
  });

  describe('6. Non-Existent Course Codes', () => {
    it('6.1 get_course_schedule for non-existent code "00000"', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-6.1',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: '00000' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/not found or is not taught/i);
    });

    it('6.2 get_course_schedule for non-existent code "99999"', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-6.2',
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: { courseCode: '99999' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/not found or is not taught/i);
    });

    it('6.3 search_courses for non-existent keyword returns empty array', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-6.3',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: { query: 'nonexistent_course_query_xyz_999' },
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
      const results = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(results).toEqual([]);
    });
  });

  describe('7. Malformed Parameter Payloads', () => {
    it('7.1 JSON-RPC request payload as plain string', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('malformed jsonrpc string'),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600);
    });

    it('7.2 JSON-RPC request payload as array instead of object', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ jsonrpc: '2.0', method: 'tools/list', id: 1 }]),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600);
    });

    it('7.3 Invalid jsonrpc protocol version "1.0"', async () => {
      const payload = {
        jsonrpc: '1.0',
        id: 'stress-7.3',
        method: 'tools/list',
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600);
    });

    it('7.4 arguments parameter passed as string instead of object', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 'stress-7.4',
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: 'query=61767',
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.isError).toBe(true);
    });
  });

  describe('8. High Concurrency & Load Stress for M3 Tools', () => {
    it('8.1 100 parallel POST /mcp requests for M3 tools (search_courses & get_course_schedule)', async () => {
      const requests = Array.from({ length: 100 }, (_, i) => {
        const isSearch = i % 2 === 0;
        const payload = isSearch
          ? {
              jsonrpc: '2.0',
              id: `parallel-m3-${i}`,
              method: 'tools/call',
              params: {
                name: 'search_courses',
                arguments: { query: i % 4 === 0 ? '61767' : 'מחשב' },
              },
            }
          : {
              jsonrpc: '2.0',
              id: `parallel-m3-${i}`,
              method: 'tools/call',
              params: {
                name: 'get_course_schedule',
                arguments: { courseCode: '61767' },
              },
            };

        return doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      });

      const startTime = performance.now();
      const responses = await Promise.all(requests);
      const durationMs = performance.now() - startTime;

      expect(responses.length).toBe(100);

      const jsonResults = await Promise.all(responses.map((r) => r.json() as Promise<any>));
      const successes = jsonResults.filter((r) => r.result && r.result.isError === false);
      expect(successes.length).toBe(100);

      console.log(`[M3 CHALLENGER STRESS] 100 parallel M3 tool requests completed in ${durationMs.toFixed(2)} ms (${(durationMs / 100).toFixed(2)} ms/req)`);
    });
  });
});
