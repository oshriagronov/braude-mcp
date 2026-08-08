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

describe('Course Search & Schedule MCP Integration Suite (M3)', () => {
  describe('Tool: search_courses', () => {
    it('1.1 executes search_courses with valid query string', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 301,
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: {
            query: 'אבטחת מידע',
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
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(301);
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);
      expect(Array.isArray(data.result.content)).toBe(true);

      const searchResults = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
    });

    it('1.2 handles search_courses with empty results gracefully', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 302,
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: {
            query: 'nonexistent_course_query_xyz_123',
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
      const results = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(results).toHaveLength(0);
    });

    it('1.3 returns error if required query parameter is missing', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 303,
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
      expect(data.result?.isError === true || data.error !== undefined).toBe(true);
    });
  });

  describe('Tool: get_course_schedule', () => {
    it('2.1 executes get_course_schedule with valid courseCode', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 401,
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: {
            courseCode: '61767',
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
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(401);
      expect(data.result.isError).toBe(false);

      const detail = JSON.parse(data.result.content[0].text) as CourseScheduleDetail;
      expect(detail.courseCode).toBe('61767');
      expect(Array.isArray(detail.groups)).toBe(true);
      expect(detail.groups.length).toBeGreaterThan(0);
    });

    it('2.2 handles get_course_schedule for non-existent courseCode', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 402,
        method: 'tools/call',
        params: {
          name: 'get_course_schedule',
          arguments: {
            courseCode: '00000',
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
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/not found|error|לא קיים/i);
    });

    it('2.3 returns error if required courseCode parameter is missing', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 403,
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
    });
  });

  describe('Sequential Multi-Tool Flow', () => {
    it('3.1 completes full student workflow: search_courses -> get_course_schedule', async () => {
      // Step 1: Search for course
      const searchRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 501,
          method: 'tools/call',
          params: { name: 'search_courses', arguments: { query: 'אבטחת מידע' } },
        }),
      });

      const searchData = (await searchRes.json()) as any;
      expect(searchData.result.isError).toBe(false);
      const courses = JSON.parse(searchData.result.content[0].text) as CourseSummary[];
      expect(courses.length).toBeGreaterThan(0);

      const targetCourseCode = courses[0].courseCode;

      // Step 2: Fetch detailed schedule for found course code
      const scheduleRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 502,
          method: 'tools/call',
          params: { name: 'get_course_schedule', arguments: { courseCode: targetCourseCode } },
        }),
      });

      const scheduleData = (await scheduleRes.json()) as any;
      expect(scheduleData.result.isError).toBe(false);
      const scheduleDetail = JSON.parse(scheduleData.result.content[0].text) as CourseScheduleDetail;
      expect(scheduleDetail.courseCode).toBe(targetCourseCode);
    });
  });
});
