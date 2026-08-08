import { describe, it, expect } from 'vitest';
import app from '../../src/index.js';
import { parseCalendarHtml, fetchAcademicCalendar } from '../../src/scrapers/calendar.js';
import type { AcademicCalendarData } from '../../src/types/index.js';

async function callMcp(payload: unknown): Promise<any> {
  const req = new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const res = await app.fetch(req);
  return res.json();
}

describe('M2 Adversarial Challenger Test Suite', () => {
  describe('1. get_academic_calendar Tool Verification', () => {
    it('1.1 Empty arguments {} returns full calendar data with all available years', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.1',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: {},
        },
      });

      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe('test-1.1');
      expect(res.result).toBeDefined();
      expect(res.result.isError).toBe(false);
      expect(res.result.content).toHaveLength(1);
      expect(res.result.content[0].type).toBe('text');

      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.sourceUrl).toContain('braude.ac.il');
      expect(parsed.fetchedAt).toBeDefined();
      expect(parsed.years.length).toBeGreaterThan(0);
    });

    it('1.2 Year filter "2025-2026" returns matched academic year', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.2',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: '2025-2026' },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years.length).toBeGreaterThan(0);
      for (const yr of parsed.years) {
        expect(yr.academicYear.includes('2025-2026') || yr.academicYear.includes('2026-2025') || yr.academicYear.includes('תשפ"ו')).toBe(true);
      }
    });

    it('1.3 Year filter "2024-2025" returns matched academic year', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.3',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: '2024-2025' },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years.length).toBeGreaterThan(0);
      for (const yr of parsed.years) {
        expect(yr.academicYear.includes('2024-2025') || yr.academicYear.includes('2025-2024') || yr.academicYear.includes('תשפ"ה')).toBe(true);
      }
    });

    it('1.4 Non-existent year filter "1999-2000" returns empty years array cleanly', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.4',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: '1999-2000' },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years).toEqual([]);
    });

    it('1.5 Hebrew year filter "תשפ\"ו" matches relevant year', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.5',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: 'תשפ"ו' },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years.length).toBeGreaterThan(0);
      expect(parsed.years[0].academicYear).toContain('תשפ"ו');
    });

    it('1.6 Year filter with numeric argument { year: 2025 } converts gracefully', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.6',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: 2025 },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years.length).toBeGreaterThan(0);
    });

    it('1.7 Year filter with leading/trailing spaces "  2025-2026  " works', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-1.7',
        method: 'tools/call',
        params: {
          name: 'get_academic_calendar',
          arguments: { year: '  2025-2026  ' },
        },
      });

      expect(res.result.isError).toBe(false);
      const parsed: AcademicCalendarData = JSON.parse(res.result.content[0].text);
      expect(parsed.years.length).toBeGreaterThan(0);
    });
  });

  describe('2. braude://calendar/current Resource Verification', () => {
    it('2.1 Read current calendar resource returns application/json with URI braude://calendar/current', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-2.1',
        method: 'resources/read',
        params: { uri: 'braude://calendar/current' },
      });

      expect(res.jsonrpc).toBe('2.0');
      expect(res.id).toBe('test-2.1');
      expect(res.result).toBeDefined();
      expect(res.result.contents).toHaveLength(1);
      expect(res.result.contents[0].uri).toBe('braude://calendar/current');
      expect(res.result.contents[0].mimeType).toBe('application/json');

      const parsed: AcademicCalendarData = JSON.parse(res.result.contents[0].text);
      expect(parsed.sourceUrl).toContain('braude.ac.il');
      expect(parsed.years.length).toBeGreaterThan(0);
    });

    it('2.2 Read invalid resource URI returns JSON-RPC error -32602', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-2.2',
        method: 'resources/read',
        params: { uri: 'braude://calendar/invalid' },
      });

      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32602);
      expect(res.error.message).toContain('Resource "braude://calendar/invalid" not found');
    });

    it('2.3 resources/list contains braude://calendar/current resource definition', async () => {
      const res = await callMcp({
        jsonrpc: '2.0',
        id: 'test-2.3',
        method: 'resources/list',
      });

      expect(res.result).toBeDefined();
      expect(res.result.resources).toBeDefined();
      const calendarRes = res.result.resources.find((r: any) => r.uri === 'braude://calendar/current');
      expect(calendarRes).toBeDefined();
      expect(calendarRes.name).toBe('Current Academic Calendar');
      expect(calendarRes.mimeType).toBe('application/json');
    });
  });

  describe('3. Scraper Edge Cases & HTML Parsing Resilience', () => {
    it('3.1 Live network fetch vs Fallback behavior', async () => {
      const data = await fetchAcademicCalendar();
      expect(data).toBeDefined();
      expect(data.years.length).toBeGreaterThan(0);
    });

    it('3.2 Parsing HTML with missing or unexpected elements returns valid structure without throwing', () => {
      const malformedHtml = '<div><p>Random text without calendar structure</p></div>';
      const parsed = parseCalendarHtml(malformedHtml, 'https://w3.braude.ac.il/test');
      expect(parsed.sourceUrl).toBe('https://w3.braude.ac.il/test');
      expect(parsed.years).toEqual([]);
    });

    it('3.3 Parsing HTML with custom accordion structures', () => {
      const customHtml = `
        <li class="accordion-item">
          <a class="accordion-title">לוח תשפ"ז 2027-2026</a>
          <div class="accordion-content">
            <p><strong>סמסטר א'</strong> 01.11.2026 – 31.01.2027</p>
          </div>
        </li>
      `;
      const parsed = parseCalendarHtml(customHtml, 'https://w3.braude.ac.il/test');
      expect(parsed.years).toHaveLength(1);
      expect(parsed.years[0].academicYear).toBe('לוח תשפ"ז 2027-2026');
      expect(parsed.years[0].semesterA).toHaveLength(1);
      expect(parsed.years[0].semesterA[0].startDate).toBe('2026-11-01');
      expect(parsed.years[0].semesterA[0].endDate).toBe('2027-01-31');
    });
  });
});
