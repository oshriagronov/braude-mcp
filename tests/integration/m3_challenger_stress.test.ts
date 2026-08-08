import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import {
  parseCourseSearchHtml,
  parseCourseScheduleHtml,
  FALLBACK_COURSES_SEARCH_HTML,
  FALLBACK_COURSE_61767_HTML,
} from '../../src/scrapers/course_search.js';
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

describe('M3 Challenger Stress & Concurrency Suite', () => {
  // =========================================================================
  // Section 1: Concurrency and High-Load Stress
  // =========================================================================
  describe('1. Concurrency and High-Load MCP Endpoints', () => {
    it('1.1 120 simultaneous concurrent POST /mcp calls mixing search_courses, get_course_schedule, and get_academic_calendar', async () => {
      const CONCURRENCY = 120;
      const startTime = performance.now();

      const tools = ['search_courses', 'get_course_schedule', 'get_academic_calendar'];
      const searchQueries = ['אבטחת מידע', 'מבוא למדעי המחשב', 'מבני נתונים', 'אלגוריתמים'];
      const courseCodes = ['61767', '61101', '61204', '61307'];
      const years = ['2025-2026', '2024-2025', 'תשפ"ו'];

      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const tool = tools[i % tools.length];
        let args: Record<string, unknown> = {};

        if (tool === 'search_courses') {
          args = { query: searchQueries[i % searchQueries.length] };
        } else if (tool === 'get_course_schedule') {
          args = { courseCode: courseCodes[i % courseCodes.length] };
        } else if (tool === 'get_academic_calendar') {
          args = { year: years[i % years.length] };
        }

        return doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 1,
            method: 'tools/call',
            params: {
              name: tool,
              arguments: args,
            },
          }),
        });
      });

      const responses = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(responses.length).toBe(CONCURRENCY);

      let successCount = 0;
      for (let i = 0; i < CONCURRENCY; i++) {
        const res = responses[i];
        expect(res.status).toBe(200);

        const data = (await res.json()) as any;
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(i + 1);
        expect(data.result).toBeDefined();
        expect(data.result.isError).toBe(false);
        expect(Array.isArray(data.result.content)).toBe(true);
        expect(data.result.content.length).toBeGreaterThan(0);

        successCount++;
      }

      const successRate = (successCount / CONCURRENCY) * 100;
      console.log(
        `[M3 STRESS] 120 concurrent mixed calls completed in ${duration.toFixed(2)} ms. Success rate: ${successRate}%`
      );

      expect(successRate).toBe(100);
    });

    it('1.2 Sustained wave burst load (300 total calls in 3 waves of 100) verifying zero memory leaks', async () => {
      const WAVES = 3;
      const WAVE_SIZE = 100;
      const TOTAL_CALLS = WAVES * WAVE_SIZE;

      const initialMemory = process.memoryUsage().heapUsed;
      let totalSuccess = 0;

      for (let wave = 0; wave < WAVES; wave++) {
        const wavePromises = Array.from({ length: WAVE_SIZE }, (_, i) => {
          const reqId = wave * WAVE_SIZE + i + 1000;
          const mode = i % 3;

          let toolName = 'search_courses';
          let args: Record<string, unknown> = { query: 'אלגוריתמים' };

          if (mode === 1) {
            toolName = 'get_course_schedule';
            args = { courseCode: '61767' };
          } else if (mode === 2) {
            toolName = 'get_academic_calendar';
            args = { year: '2025' };
          }

          return doFetch('/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: reqId,
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: args,
              },
            }),
          });
        });

        const responses = await Promise.all(wavePromises);
        for (const res of responses) {
          if (res.status === 200) {
            const data = (await res.json()) as any;
            if (data.result && !data.result.isError) {
              totalSuccess++;
            }
          }
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryDiffMB = (finalMemory - initialMemory) / (1024 * 1024);

      console.log(
        `[M3 STRESS] Sustained burst (${TOTAL_CALLS} requests across ${WAVES} waves): ${totalSuccess}/${TOTAL_CALLS} succeeded. Memory Heap Diff: ${memoryDiffMB.toFixed(2)} MB`
      );

      expect(totalSuccess).toBe(TOTAL_CALLS);
      // Memory leakage threshold: heap growth under 50MB across 300 heavy requests
      expect(memoryDiffMB).toBeLessThan(50);
    });

    it('1.3 High-concurrency mixed payload stress combining invalid and valid requests (150 calls)', async () => {
      const CONCURRENCY = 150;
      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const isMalformed = i % 5 === 0;

        if (isMalformed) {
          // Send invalid arguments or missing parameters
          return doFetch('/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: i + 5000,
              method: 'tools/call',
              params: {
                name: i % 2 === 0 ? 'search_courses' : 'get_course_schedule',
                arguments: {}, // Missing required parameters
              },
            }),
          });
        }

        // Valid request
        return doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 5000,
            method: 'tools/call',
            params: {
              name: 'search_courses',
              arguments: { query: `query_${i}` },
            },
          }),
        });
      });

      const responses = await Promise.all(promises);
      expect(responses.length).toBe(CONCURRENCY);

      for (let i = 0; i < CONCURRENCY; i++) {
        const res = responses[i];
        expect(res.status).toBe(200); // Server always returns 200 HTTP status with JSON-RPC error payload
        const data = (await res.json()) as any;
        expect(data.id).toBe(i + 5000);
        expect(data.jsonrpc).toBe('2.0');

        if (i % 5 === 0) {
          // Malformed request -> result.isError is true
          expect(data.result).toBeDefined();
          expect(data.result.isError).toBe(true);
        } else {
          // Valid request -> result.isError is false
          expect(data.result).toBeDefined();
          expect(data.result.isError).toBe(false);
        }
      }
    });
  });

  // =========================================================================
  // Section 2: Pure Scraper Function Edge Cases & Robustness
  // =========================================================================
  describe('2. Scraper Function Robustness and Edge Case Handling', () => {
    it('2.1 parseCourseSearchHtml handles malformed, truncated, or non-course HTML safely', () => {
      const testCases = [
        '',
        '   ',
        '<html><body><h1>No table here</h1></body></html>',
        '<table><tr><td>Random Text</td></tr></table>',
        '<table class="SearchResultsTable"><tr><td>61767</td><td></td></tr></table>',
        '<div><p>לא נמצאו קורסים מתאימים</p></div>',
      ];

      for (const html of testCases) {
        expect(() => parseCourseSearchHtml(html)).not.toThrow();
        const results = parseCourseSearchHtml(html);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    it('2.2 parseCourseScheduleHtml handles missing courses and throws clean error', () => {
      const htmlNotFound = `<html><body><p>קורס לא קיים במערכת</p></body></html>`;
      expect(() => parseCourseScheduleHtml(htmlNotFound, '99999')).toThrow(/was not found or is not taught/);
    });

    it('2.3 parseCourseScheduleHtml parses complex group rows with unexpected text formatting', () => {
      const htmlComplexGroup = `
        <!DOCTYPE html>
        <html>
        <body>
          <h1>61999 - קורס מתקדם</h1>
          <p>נקודות זכות: 4.5</p>
          <p>דרישות קדם: 61101 מבוא, 61204 מבני נתונים</p>
          <table>
            <tr>
              <td>01</td>
              <td>הרצאה קבועה</td>
              <td>פרופ' אברהם אבינו</td>
              <td>יום ב'</td>
              <td>10:00 - 13:00</td>
              <td>בניין M חדר 102</td>
            </tr>
          </table>
        </body>
        </html>
      `;

      const detail = parseCourseScheduleHtml(htmlComplexGroup, '61999');
      expect(detail.courseCode).toBe('61999');
      expect(detail.credits).toBe(4.5);
      expect(detail.prerequisites).toEqual(['61101 מבוא', '61204 מבני נתונים']);
      expect(detail.groups.length).toBe(1);
      expect(detail.groups[0].groupType).toBe('lecture');
      expect(detail.groups[0].instructor).toContain('אברהם');
    });
  });
});
