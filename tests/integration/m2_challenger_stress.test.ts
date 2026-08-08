import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import {
  parseCalendarHtml,
  extractDateRange,
  classifyCategory,
  matchesYearFilter,
  parseIsoDate,
  fetchAcademicCalendar,
} from '../../src/scrapers/calendar.js';
import type { AcademicCalendarData } from '../../src/types/index.js';

async function doFetch(path: string, options?: RequestInit): Promise<Response> {
  const req = new Request(`http://localhost${path}`, options);
  return app.fetch(req);
}

describe('M2 Challenger Empirical Stress Suite', () => {
  // =========================================================================
  // Section 1: Rapid Parallel Tool Invocations for get_academic_calendar
  // =========================================================================
  describe('1. Rapid Parallel Invocations of get_academic_calendar', () => {
    it('1.1 100 simultaneous parallel tool/call requests for get_academic_calendar', async () => {
      const CONCURRENCY = 100;
      const startTime = performance.now();

      const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
        doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i + 1,
            method: 'tools/call',
            params: {
              name: 'get_academic_calendar',
              arguments: { year: i % 2 === 0 ? '2025-2026' : '2024-2025' },
            },
          }),
        })
      );

      const responses = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(responses.length).toBe(CONCURRENCY);

      for (let i = 0; i < CONCURRENCY; i++) {
        const res = responses[i];
        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.jsonrpc).toBe('2.0');
        expect(data.id).toBe(i + 1);
        expect(data.result).toBeDefined();
        expect(data.result.isError).toBe(false);

        const cal = JSON.parse(data.result.content[0].text) as AcademicCalendarData;
        expect(cal.sourceUrl).toContain('braude.ac.il');
        expect(Array.isArray(cal.years)).toBe(true);
      }

      console.log(`[CHALLENGER STRESS] 100 parallel get_academic_calendar requests completed in ${duration.toFixed(2)} ms`);
    });

    it('1.2 200 parallel requests mixing get_academic_calendar with resource reads', async () => {
      const CONCURRENCY = 200;
      const startMemory = process.memoryUsage().heapUsed;

      const promises = Array.from({ length: CONCURRENCY }, (_, i) => {
        const isToolCall = i % 2 === 0;
        return doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            isToolCall
              ? {
                  jsonrpc: '2.0',
                  id: i + 500,
                  method: 'tools/call',
                  params: {
                    name: 'get_academic_calendar',
                    arguments: { year: '2025' },
                  },
                }
              : {
                  jsonrpc: '2.0',
                  id: i + 500,
                  method: 'resources/read',
                  params: { uri: 'braude://calendar/current' },
                }
          ),
        });
      });

      const responses = await Promise.all(promises);
      const endMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < CONCURRENCY; i++) {
        expect(responses[i].status).toBe(200);
        const data = (await responses[i].json()) as any;
        expect(data.id).toBe(i + 500);
        expect(data.result).toBeDefined();
      }

      const memDiffMB = (endMemory - startMemory) / (1024 * 1024);
      console.log(`[CHALLENGER STRESS] 200 mixed requests completed. Heap diff: ${memDiffMB.toFixed(2)} MB`);
      expect(memDiffMB).toBeLessThan(50);
    });
  });

  // =========================================================================
  // Section 2: Invalid Resource URIs and Malformed Tool Argument Types
  // =========================================================================
  describe('2. Invalid Resource URIs and Malformed Tool Arguments', () => {
    it('2.1 handles malformed argument types for year parameter without crashing', async () => {
      const malformedYearValues = [
        12345,
        true,
        false,
        null,
        ['2025-2026'],
        { year: '2025' },
        '<script>alert(1)</script>',
        "'; DROP TABLE calendar; --",
        'A'.repeat(10000),
        'תשפ"ו 🐉',
        '',
        '   ',
      ];

      for (let i = 0; i < malformedYearValues.length; i++) {
        const val = malformedYearValues[i];
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 200 + i,
            method: 'tools/call',
            params: {
              name: 'get_academic_calendar',
              arguments: { year: val },
            },
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.id).toBe(200 + i);
        expect(data.result).toBeDefined();
        expect(data.result.isError).toBe(false);
      }
    });

    it('2.2 handles missing, null, primitive, or array params/arguments gracefully', async () => {
      const malformedPayloads = [
        { jsonrpc: '2.0', id: 301, method: 'tools/call', params: { name: 'get_academic_calendar' } },
        { jsonrpc: '2.0', id: 302, method: 'tools/call', params: { name: 'get_academic_calendar', arguments: null } },
        { jsonrpc: '2.0', id: 303, method: 'tools/call', params: { name: 'get_academic_calendar', arguments: 12345 } },
        { jsonrpc: '2.0', id: 304, method: 'tools/call', params: { name: 'get_academic_calendar', arguments: 'invalid' } },
        { jsonrpc: '2.0', id: 305, method: 'tools/call', params: { name: 'get_academic_calendar', arguments: [1, 2, 3] } },
      ];

      for (const payload of malformedPayloads) {
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.id).toBe(payload.id);
        expect(data.result).toBeDefined();
        expect(data.result.isError).toBe(false);
      }
    });

    it('2.3 rejects invalid or malformed resource URIs with -32602', async () => {
      const invalidURIs = [
        'braude://calendar/current/',
        'braude://calendar/Current',
        'braude://calendar/current?query=1',
        'braude://calendar/2025-2026',
        'braude://calendar',
        'braude://',
        'file:///etc/passwd',
        'http://w3.braude.ac.il/calander-newsletter/',
        'braude://calendar/current\0',
        '../../../etc/passwd',
      ];

      for (let i = 0; i < invalidURIs.length; i++) {
        const uri = invalidURIs[i];
        const res = await doFetch('/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 400 + i,
            method: 'resources/read',
            params: { uri },
          }),
        });

        expect(res.status).toBe(200);
        const data = (await res.json()) as any;
        expect(data.id).toBe(400 + i);
        expect(data.error).toBeDefined();
        expect(data.error.code).toBe(-32602);
      }
    });
  });

  // =========================================================================
  // Section 3: HTML Parser Edge Cases (Missing dates, Hebrew titles, spaces)
  // =========================================================================
  describe('3. HTML Parser Edge Cases', () => {
    it('3.1 handles accordion items without dates gracefully', () => {
      const htmlNoDates = `
        <ul class="accordion">
          <li class="accordion-item">
            <a class="accordion-title">לוח שנה אקדמית תשפ"ו 2026-2025</a>
            <div class="accordion-content">
              <p>טקסט ללא תאריכים כלל</p>
              <p>הודעה חשובה לסטודנטים</p>
              <p>&nbsp;</p>
              <div><span>מידע נוסף</span></div>
            </div>
          </li>
        </ul>
      `;

      const parsed = parseCalendarHtml(htmlNoDates, 'https://test');
      expect(parsed.years.length).toBe(1);
      const year = parsed.years[0];
      expect(year.generalEvents.length).toBe(3); // 3 non-empty paragraphs/lines
      expect(year.generalEvents[0].startDate).toBe('');
      expect(year.generalEvents[0].endDate).toBeUndefined();
      expect(year.generalEvents[0].category).toBe('other');
    });

    it('3.2 handles complex Hebrew titles with non-breaking spaces, quotes, and punctuation', () => {
      const htmlComplexHebrew = `
        <ul class="accordion">
          <li class="accordion-item">
            <a class="accordion-title">  לוח&nbsp;שנה&nbsp;אקדמית&nbsp;תשפ"ו&nbsp;2026-2025  </a>
            <div class="accordion-content">
              <p><strong>סמסטר&nbsp;א'</strong>&nbsp;26.10.2025&nbsp;–&nbsp;25.01.2026</p>
              <p><strong>חג&nbsp;הסוכות&nbsp;והושענא&nbsp;רבה</strong>&nbsp;06.10.2025-14.10.2025</p>
              <p><strong>צום&nbsp;גדול&nbsp;(יום&nbsp;כיפור)</strong>&nbsp;01.10.2025</p>
            </div>
          </li>
        </ul>
      `;

      const parsed = parseCalendarHtml(htmlComplexHebrew, 'https://test');
      expect(parsed.years.length).toBe(1);
      const year = parsed.years[0];
      // Note: rawTitle retains NBSP (\u00A0) from Cheerio text() if HTML contains &nbsp;
      expect(year.academicYear.replace(/\u00A0/g, ' ')).toBe('לוח שנה אקדמית תשפ"ו 2026-2025');

      expect(year.semesterA.length).toBe(3);
      expect(year.semesterA[0].title).toBe("סמסטר א'");
      expect(year.semesterA[0].startDate).toBe('2025-10-26');
      expect(year.semesterA[0].endDate).toBe('2026-01-25');

      expect(year.semesterA[1].title).toBe('חג הסוכות והושענא רבה');
      expect(year.semesterA[1].category).toBe('holiday');
      expect(year.semesterA[1].startDate).toBe('2025-10-06');
      expect(year.semesterA[1].endDate).toBe('2025-10-14');

      expect(year.semesterA[2].title).toBe('צום גדול (יום כיפור)');
      expect(year.semesterA[2].category).toBe('holiday');
      expect(year.semesterA[2].startDate).toBe('2025-10-01');
    });

    it('3.3 handles missing accordion elements or completely empty/malformed HTML', () => {
      const htmlVariants = [
        '',
        '   ',
        '<div>No accordion here</div>',
        '<html><body><p>Random HTML</p></body></html>',
        '<ul class="accordion"><li class="accordion-item"></li></ul>',
        '<ul class="accordion"><li class="accordion-item"><a class="accordion-title">Year Only</a></li></ul>',
      ];

      for (const html of htmlVariants) {
        expect(() => parseCalendarHtml(html, 'https://test')).not.toThrow();
      }
    });

    it('3.4 tests extractDateRange edge cases for start dates missing year in range', () => {
      // e.g. "26.10 – 25.01.2026"
      const res = extractDateRange('סמסטר א\' 26.10 – 25.01.2026');
      expect(res.startDate).toBe('2026-10-26'); // Year falls back to end year (2026)
      expect(res.endDate).toBe('2026-01-25');
    });

    it('3.5 tests matchesYearFilter with various Hebrew and numeric representations', () => {
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2025-2026')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2026-2025')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2025')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2026')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', 'תשפ"ו')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', 'תשפ')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2023-2024')).toBe(false);
    });
  });
});
