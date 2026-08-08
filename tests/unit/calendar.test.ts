import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCalendarHtml,
  extractDateRange,
  classifyCategory,
  fetchAcademicCalendar,
  parseIsoDate,
  matchesYearFilter,
} from '../../src/scrapers/calendar.js';

const MOCK_CALENDAR_HTML = `
<!DOCTYPE html>
<html lang="he-IL">
<body>
  <ul class="accordion" data-accordion data-allow-all-closed="true">
    <li class="accordion-item" data-accordion-item>
      <a href="#" class="accordion-title">לוח שנה אקדמית תשפ"ו 2026-2025</a>
      <div class="accordion-content" data-tab-content>
        <p><strong>סמסטר א'</strong> 26.10.2025 – 25.01.2026</p>
        <p><strong>בחינות מועד א' סמסטר א'</strong> 01.02.2026 – 27.02.2026</p>
        <p><strong>חופשת ראש השנה</strong> 22.09.2025 – 24.09.2025</p>
        <p><strong>צום יום כיפור</strong> 01.10.2025</p>
        <p><strong>רישום לקורסים סמסטר א'</strong> 01.09.2025 – 15.09.2025</p>
        <p><strong>יום אוריינטציה שנה א'</strong> 19.10.2025</p>
        <p><strong>סמסטר ב'</strong> 08.03.2026 – 19.06.2026</p>
        <p><strong>סמסטר קיץ</strong> 05.07.2026 – 21.08.2026</p>
        <a href="https://w3.braude.ac.il/wp-content/uploads/2025/06/calendar_2025_2026.pdf">להורדת לוח שנה מודפס (PDF)</a>
      </div>
    </li>
    <li class="accordion-item" data-accordion-item>
      <a href="#" class="accordion-title">לוח שנה אקדמית תשפ"ה 2025-2024</a>
      <div class="accordion-content" data-tab-content>
        <p><strong>סמסטר א'</strong> 03.11.2024 – 31.01.2025</p>
        <p><strong>סמסטר ב'</strong> 09.03.2025 – 20.06.2025</p>
      </div>
    </li>
  </ul>
</body>
</html>
`;

describe('Academic Calendar Scraper Unit Tests (src/scrapers/calendar.ts)', () => {
  describe('parseIsoDate', () => {
    it('parses full date DD.MM.YYYY into YYYY-MM-DD', () => {
      expect(parseIsoDate('26.10.2025')).toBe('2025-10-26');
      expect(parseIsoDate('01.02.2026')).toBe('2026-02-01');
    });

    it('uses fallback year when year is omitted DD.MM', () => {
      expect(parseIsoDate('26.10', '2025')).toBe('2025-10-26');
    });

    it('returns undefined for invalid date format', () => {
      expect(parseIsoDate('invalid')).toBeUndefined();
      expect(parseIsoDate('')).toBeUndefined();
    });
  });

  describe('extractDateRange', () => {
    it('parses date range with en-dash and dots correctly', () => {
      const result = extractDateRange('סמסטר א\' 26.10.2025 – 25.01.2026');
      expect(result).toEqual({
        startDate: '2025-10-26',
        endDate: '2026-01-25',
        rawDateStr: '26.10.2025 – 25.01.2026',
        title: "סמסטר א'",
      });
    });

    it('parses single date correctly', () => {
      const result = extractDateRange('צום יום כיפור 01.10.2025');
      expect(result).toEqual({
        startDate: '2025-10-01',
        endDate: undefined,
        rawDateStr: '01.10.2025',
        title: 'צום יום כיפור',
      });
    });

    it('handles non-standard hyphens and non-breaking spaces', () => {
      const result = extractDateRange('סמסטר&nbsp;ב\'&nbsp;08.03.2026-19.06.2026');
      expect(result.startDate).toBe('2026-03-08');
      expect(result.endDate).toBe('2026-06-19');
    });

    it('returns empty object when no valid date is present', () => {
      const result = extractDateRange('טקסט ללא תאריך כלל');
      expect(result).toEqual({});
    });
  });

  describe('classifyCategory', () => {
    it('classifies semester start/end correctly', () => {
      expect(classifyCategory('סמסטר א\'')).toBe('semester_start');
      expect(classifyCategory('סיום סמסטר ב\'')).toBe('semester_end');
      expect(classifyCategory('פתיחת שנת הלימודים')).toBe('semester_start');
    });

    it('classifies exam periods correctly', () => {
      expect(classifyCategory('בחינות מועד א\' סמסטר א\'')).toBe('exam_period');
      expect(classifyCategory('בחינות מועדים מיוחדים')).toBe('exam_period');
    });

    it('classifies holidays correctly', () => {
      expect(classifyCategory('חופשת ראש השנה')).toBe('holiday');
      expect(classifyCategory('צום יום כיפור')).toBe('holiday');
      expect(classifyCategory('חג הפסח')).toBe('holiday');
    });

    it('classifies course registration correctly', () => {
      expect(classifyCategory('רישום לקורסים סמסטר א\'')).toBe('registration');
    });

    it('falls back to "other" for unmapped event titles', () => {
      expect(classifyCategory('יום אוריינטציה שנה א\'')).toBe('other');
    });
  });

  describe('matchesYearFilter', () => {
    it('matches exact and reversed year ranges', () => {
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2025-2026')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '2026-2025')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', 'תשפ"ו')).toBe(true);
      expect(matchesYearFilter('לוח שנה אקדמית תשפ"ו 2026-2025', '1990')).toBe(false);
    });
  });

  describe('parseCalendarHtml', () => {
    it('parses full HTML fixture into AcademicCalendarData', () => {
      const data = parseCalendarHtml(MOCK_CALENDAR_HTML, 'https://w3.braude.ac.il/calander-newsletter/');
      expect(data.sourceUrl).toBe('https://w3.braude.ac.il/calander-newsletter/');
      expect(data.fetchedAt).toBeDefined();
      expect(data.years.length).toBe(2);

      const year2025 = data.years.find((y) => matchesYearFilter(y.academicYear, '2025-2026'));
      expect(year2025).toBeDefined();
      expect(year2025?.semesterA.length).toBeGreaterThan(0);
      expect(year2025?.semesterB.length).toBeGreaterThan(0);
      expect(year2025?.summerSemester?.length).toBeGreaterThan(0);
    });

    it('filters calendar data by specific academic year when requested', () => {
      const data2024 = parseCalendarHtml(MOCK_CALENDAR_HTML, 'https://w3.braude.ac.il/calander-newsletter/', '2024-2025');
      expect(data2024.years.length).toBe(1);
      expect(data2024.years[0].academicYear).toContain('2025-2024');
    });

    it('handles empty or malformed HTML gracefully', () => {
      const emptyData = parseCalendarHtml('<html><body></body></html>', 'https://w3.braude.ac.il/calander-newsletter/');
      expect(emptyData.years).toEqual([]);
    });
  });

  describe('fetchAcademicCalendar', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('throws standard error on HTTP network failure when allowFallback is false', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network connectivity issue'));
      await expect(fetchAcademicCalendar(undefined, false)).rejects.toThrow('Network connectivity issue');
      globalThis.fetch = originalFetch;
    });

    it('throws descriptive error on non-200 HTTP response when allowFallback is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);
      await expect(fetchAcademicCalendar(undefined, false)).rejects.toThrow(/500/);
      globalThis.fetch = originalFetch;
    });
  });
});
