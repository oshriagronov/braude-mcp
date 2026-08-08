import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import type {
  AcademicCalendarData,
  CourseSummary,
  CourseScheduleDetail,
} from '../../src/types/index.js';

const TEST_ENDPOINT = process.env.TEST_ENDPOINT;

/**
 * Helper function to execute requests against either:
 * 1. Live HTTP endpoint (if TEST_ENDPOINT is defined, e.g. http://localhost:8787)
 * 2. In-memory Hono app.fetch (if TEST_ENDPOINT is undefined)
 */
async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  if (TEST_ENDPOINT) {
    const url = new URL(path, TEST_ENDPOINT).toString();
    return fetch(url, options);
  }
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('Braude MCP Remote HTTP POST /mcp E2E 4-Tier Test Suite', () => {
  // ==========================================
  // Tier 1: Feature Coverage
  // ==========================================
  describe('Tier 1: Feature Coverage', () => {
    it('1.1 GET /health returns status ok and service name', async () => {
      const res = await doFetch('/health');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/application\/json/i);

      const body = (await res.json()) as { status: string; service: string };
      expect(body.status).toBe('ok');
      expect(body.service).toBe('braude-mcp');
    });

    it('1.2 POST /mcp initialize returns valid MCP server capabilities', async () => {
      const initPayload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'vitest-client', version: '1.0.0' },
        },
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initPayload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(1);
      expect(data.result).toBeDefined();
      expect(data.result.protocolVersion).toBe('2024-11-05');
      expect(data.result.capabilities).toBeDefined();
      expect(data.result.capabilities.tools).toBeDefined();
      expect(data.result.capabilities.resources).toBeDefined();
      expect(data.result.serverInfo.name).toBe('braude-mcp');
    });

    it('1.3 POST /mcp tools/list returns complete tools list', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(2);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.tools)).toBe(true);

      const toolNames = data.result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_academic_calendar');
      expect(toolNames).toContain('search_courses');
      expect(toolNames).toContain('get_course_schedule');
    });

    it('1.4 POST /mcp resources/list returns resources list', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(3);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.resources)).toBe(true);

      const resourceUris = data.result.resources.map((r: any) => r.uri);
      expect(resourceUris).toContain('braude://calendar/current');
    });

    it('1.5 POST /mcp resources/read reads braude://calendar/current', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 4,
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
      expect(data.id).toBe(4);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.result.contents)).toBe(true);

      const content = data.result.contents[0];
      expect(content.uri).toBe('braude://calendar/current');
      expect(content.mimeType).toBe('application/json');

      const parsedData = JSON.parse(content.text);
      expect(parsedData).toBeDefined();
      expect(parsedData.sourceUrl).toContain('braude.ac.il');
    });

    it('1.6 POST /mcp tools/call executes get_academic_calendar', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 5,
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
      expect(data.id).toBe(5);
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);
      expect(Array.isArray(data.result.content)).toBe(true);

      const calendarData = JSON.parse(data.result.content[0].text) as AcademicCalendarData;
      expect(calendarData.sourceUrl).toContain('braude.ac.il');
      expect(Array.isArray(calendarData.years)).toBe(true);
    });

    it('1.7 POST /mcp tools/call executes search_courses', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 6,
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
      expect(data.id).toBe(6);
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);

      const courses = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(Array.isArray(courses)).toBe(true);
      expect(courses.length).toBeGreaterThan(0);
      expect(courses[0].courseCode).toBeDefined();
      expect(courses[0].courseName).toBeDefined();
    });

    it('1.8 POST /mcp tools/call executes get_course_schedule', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 7,
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
      expect(data.id).toBe(7);
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);

      const schedule = JSON.parse(data.result.content[0].text) as CourseScheduleDetail;
      expect(schedule.courseCode).toBe('61767');
      expect(schedule.courseName).toBeDefined();
      expect(Array.isArray(schedule.groups)).toBe(true);
      expect(schedule.groups.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Tier 2: Boundary & Edge Cases
  // ==========================================
  describe('Tier 2: Boundary & Edge Cases', () => {
    it('2.1 POST /mcp with malformed JSON returns Parse Error (-32700)', async () => {
      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed_json_payload ...',
      });

      expect([200, 400]).toContain(res.status);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32700);
    });

    it('2.2 POST /mcp missing jsonrpc field returns Invalid Request (-32600)', async () => {
      const payload = {
        id: 201,
        method: 'tools/list',
      };

      const res = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect([200, 400]).toContain(res.status);
      const data = (await res.json()) as any;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600);
    });

    it('2.3 POST /mcp with unknown method returns Method Not Found (-32601)', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 202,
        method: 'unknown/nonexistent_method',
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
      expect(data.error.code).toBe(-32601);
    });

    it('2.4 POST /mcp tools/call with unknown tool name returns Method Not Found (-32601)', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 203,
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool_name',
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
      expect(data.id).toBe(203);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601);
    });

    it('2.5 POST /mcp tools/call search_courses with missing required query parameter returns error', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 204,
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
      expect(data.jsonrpc).toBe('2.0');
      expect(data.result?.isError === true || data.error !== undefined).toBe(true);
    });

    it('2.6 POST /mcp tools/call get_course_schedule with missing required courseCode returns error', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 205,
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
      expect(data.jsonrpc).toBe('2.0');
      expect(data.result?.isError === true || data.error !== undefined).toBe(true);
    });

    it('2.7 POST /mcp resources/read with non-existent URI braude://calendar/invalid returns error (-32602)', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 206,
        method: 'resources/read',
        params: {
          uri: 'braude://calendar/invalid',
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
      expect(data.id).toBe(206);
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32602);
    });

    it('2.8 POST /mcp tools/call search_courses with empty search results query returns empty array', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 207,
        method: 'tools/call',
        params: {
          name: 'search_courses',
          arguments: {
            query: 'nonexistent_course_query_xyz_999',
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
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(false);

      const results = JSON.parse(data.result.content[0].text) as CourseSummary[];
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(0);
    });

    it('2.9 POST /mcp tools/call get_course_schedule with non-existent course code returns error response', async () => {
      const payload = {
        jsonrpc: '2.0',
        id: 208,
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
      expect(data.jsonrpc).toBe('2.0');
      expect(data.result).toBeDefined();
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toMatch(/not found|error|לא קיים/i);
    });

    it('2.10 OPTIONS /mcp CORS preflight returns correct CORS headers', async () => {
      const res = await doFetch('/mcp', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect([200, 204]).toContain(res.status);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    });
  });

  // ==========================================
  // Tier 3: Cross-Feature Combinations
  // ==========================================
  describe('Tier 3: Cross-Feature Combinations', () => {
    it('3.1 Multi-tool pipeline: search_courses -> get_course_schedule -> get_academic_calendar', async () => {
      // Step 1: Search for courses
      const searchRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 301,
          method: 'tools/call',
          params: {
            name: 'search_courses',
            arguments: { query: 'אבטחת מידע' },
          },
        }),
      });

      expect(searchRes.status).toBe(200);
      const searchData = (await searchRes.json()) as any;
      expect(searchData.result.isError).toBe(false);

      const courses = JSON.parse(searchData.result.content[0].text) as CourseSummary[];
      expect(courses.length).toBeGreaterThan(0);
      const selectedCourseCode = courses[0].courseCode;

      // Step 2: Get course schedule for selected course code
      const scheduleRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 302,
          method: 'tools/call',
          params: {
            name: 'get_course_schedule',
            arguments: { courseCode: selectedCourseCode },
          },
        }),
      });

      expect(scheduleRes.status).toBe(200);
      const scheduleData = (await scheduleRes.json()) as any;
      expect(scheduleData.result.isError).toBe(false);

      const scheduleDetail = JSON.parse(scheduleData.result.content[0].text) as CourseScheduleDetail;
      expect(scheduleDetail.courseCode).toBe(selectedCourseCode);

      // Step 3: Fetch academic calendar to check semester alignment
      const calRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 303,
          method: 'tools/call',
          params: {
            name: 'get_academic_calendar',
            arguments: {},
          },
        }),
      });

      expect(calRes.status).toBe(200);
      const calData = (await calRes.json()) as any;
      expect(calData.result.isError).toBe(false);

      const calendar = JSON.parse(calData.result.content[0].text) as AcademicCalendarData;
      expect(calendar.years.length).toBeGreaterThan(0);
    });

    it('3.2 Combined Resource Read and Tool Execution workflow', async () => {
      // Step 1: Read raw calendar resource
      const resourceRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 304,
          method: 'resources/read',
          params: { uri: 'braude://calendar/current' },
        }),
      });

      expect(resourceRes.status).toBe(200);
      const resourceData = (await resourceRes.json()) as any;
      expect(resourceData.result.contents[0].uri).toBe('braude://calendar/current');

      // Step 2: Search for software engineering courses
      const searchRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 305,
          method: 'tools/call',
          params: {
            name: 'search_courses',
            arguments: { query: 'מבוא' },
          },
        }),
      });

      expect(searchRes.status).toBe(200);
      const searchData = (await searchRes.json()) as any;
      expect(searchData.result.isError).toBe(false);

      const courses = JSON.parse(searchData.result.content[0].text) as CourseSummary[];
      expect(courses.length).toBeGreaterThan(0);
    });

    it('3.3 Repeated multi-tool state independence', async () => {
      const toolSequence = [
        { method: 'tools/call', params: { name: 'get_academic_calendar', arguments: {} } },
        { method: 'tools/call', params: { name: 'search_courses', arguments: { query: 'אלגברה' } } },
        { method: 'resources/read', params: { uri: 'braude://calendar/current' } },
        { method: 'tools/call', params: { name: 'get_course_schedule', arguments: { courseCode: '61101' } } },
      ];

      for (let i = 0; i < toolSequence.length; i++) {
        const step = toolSequence[i];
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 310 + i,
            method: step.method,
            params: step.params,
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(310 + i);
        if (data.result) {
          expect(data.result).toBeDefined();
        }
      }
    });
  });

  // ==========================================
  // Tier 4: Real-World Scenarios
  // ==========================================
  describe('Tier 4: Real-World Scenarios', () => {
    it('4.1 Complete Student Schedule Planning Flow', async () => {
      // 1. Search for course 'אבטחת מידע'
      const searchRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 401,
          method: 'tools/call',
          params: { name: 'search_courses', arguments: { query: 'אבטחת מידע' } },
        }),
      });

      const searchData = (await searchRes.json()) as any;
      expect(searchData.result.isError).toBe(false);
      const courses = JSON.parse(searchData.result.content[0].text) as CourseSummary[];
      expect(courses.length).toBeGreaterThan(0);

      const course = courses[0];
      expect(course.courseCode).toBeDefined();

      // 2. Fetch course schedule details
      const scheduleRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 402,
          method: 'tools/call',
          params: { name: 'get_course_schedule', arguments: { courseCode: course.courseCode } },
        }),
      });

      const scheduleData = (await scheduleRes.json()) as any;
      expect(scheduleData.result.isError).toBe(false);
      const scheduleDetail = JSON.parse(scheduleData.result.content[0].text) as CourseScheduleDetail;
      expect(scheduleDetail.groups.length).toBeGreaterThan(0);

      // Verify groups contain necessary lecture/recitation/lab details
      const firstGroup = scheduleDetail.groups[0];
      expect(firstGroup.groupNumber).toBeDefined();
      expect(firstGroup.groupType).toBeDefined();
      expect(firstGroup.instructor).toBeDefined();
      expect(firstGroup.location).toBeDefined();
      expect(firstGroup.dayOfWeek).toBeDefined();
      expect(firstGroup.startTime).toBeDefined();
      expect(firstGroup.endTime).toBeDefined();

      // 3. Fetch academic calendar for semester dates
      const calRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 403,
          method: 'resources/read',
          params: { uri: 'braude://calendar/current' },
        }),
      });

      const calData = (await calRes.json()) as any;
      const calendarData = JSON.parse(calData.result.contents[0].text) as AcademicCalendarData;
      expect(calendarData.years.length).toBeGreaterThan(0);

      // 4. Build integrated student plan data structure
      const studentPlan = {
        studentCourse: {
          code: scheduleDetail.courseCode,
          name: scheduleDetail.courseName,
          credits: scheduleDetail.credits,
          scheduleGroups: scheduleDetail.groups.map((g) => ({
            type: g.groupTypeHebrew,
            instructor: g.instructor,
            slot: `${g.dayOfWeek} ${g.startTime}-${g.endTime}`,
            room: g.location,
          })),
        },
        academicYear: calendarData.years[0].academicYear,
        semesterAEvents: calendarData.years[0].semesterA.length,
        semesterBEvents: calendarData.years[0].semesterB.length,
      };

      expect(studentPlan.studentCourse.code).toBe(course.courseCode);
      expect(studentPlan.studentCourse.scheduleGroups.length).toBeGreaterThan(0);
      expect(studentPlan.academicYear).toBeDefined();
    });

    it('4.2 Complete Course Info Lookup & Prerequisite Verification Flow', async () => {
      // 1. Search for course '61101'
      const searchRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 410,
          method: 'tools/call',
          params: { name: 'search_courses', arguments: { query: '61101' } },
        }),
      });

      const searchData = (await searchRes.json()) as any;
      expect(searchData.result.isError).toBe(false);
      const courses = JSON.parse(searchData.result.content[0].text) as CourseSummary[];
      expect(courses.length).toBeGreaterThan(0);

      // 2. Fetch full course details
      const scheduleRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 411,
          method: 'tools/call',
          params: { name: 'get_course_schedule', arguments: { courseCode: '61101' } },
        }),
      });

      const scheduleData = (await scheduleRes.json()) as any;
      expect(scheduleData.result.isError).toBe(false);
      const scheduleDetail = JSON.parse(scheduleData.result.content[0].text) as CourseScheduleDetail;
      expect(scheduleDetail.courseCode).toBe('61101');
      expect(scheduleDetail.credits).toBeGreaterThan(0);

      // 3. Fetch academic calendar tool to verify exam periods
      const calRes = await doFetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 412,
          method: 'tools/call',
          params: { name: 'get_academic_calendar', arguments: {} },
        }),
      });

      const calData = (await calRes.json()) as any;
      expect(calData.result.isError).toBe(false);
      const calendar = JSON.parse(calData.result.content[0].text) as AcademicCalendarData;

      // Extract exam periods from current year
      const examEvents = calendar.years.flatMap((y) =>
        [...y.semesterA, ...y.semesterB].filter((e) => e.category === 'exam_period')
      );
      expect(examEvents.length).toBeGreaterThan(0);
    });
  });
});
