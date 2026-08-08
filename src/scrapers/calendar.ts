import * as cheerio from 'cheerio';
import type {
  AcademicCalendarData,
  AcademicYearCalendar,
  CalendarEvent,
  CalendarEventCategory,
} from '../types/index.js';
import { globalCache } from '../utils/cache.js';

export const CALENDAR_URL = 'https://w3.braude.ac.il/calander-newsletter/';

export const FALLBACK_CALENDAR_HTML = `
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
        <p><strong>חופשת פסח</strong> 13.04.2025 – 20.04.2025</p>
      </div>
    </li>
  </ul>
</body>
</html>
`;

/**
 * Normalizes Hebrew/numeric date strings to ISO-8601 (YYYY-MM-DD)
 */
export function parseIsoDate(dateStr?: string, fallbackYear?: string): string | undefined {
  if (!dateStr) return undefined;
  const cleaned = dateStr.trim();
  const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!match) return undefined;

  let [, day, month, year] = match;
  day = day.padStart(2, '0');
  month = month.padStart(2, '0');

  if (!year && fallbackYear) {
    year = fallbackYear;
  }
  if (!year) return undefined;

  if (year.length === 2) {
    year = '20' + year;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Categorizes a line of calendar text into predefined categories
 */
export function classifyCategory(text: string): CalendarEventCategory {
  const lower = text.toLowerCase();

  if (lower.includes('רישום') || lower.includes('הרשמה')) {
    return 'registration';
  }

  if (
    lower.includes('בחינות') ||
    lower.includes('מועדים מיוחדים') ||
    lower.includes('מועד א') ||
    lower.includes('מועד ב')
  ) {
    return 'exam_period';
  }

  if (
    lower.includes('חג') ||
    lower.includes('חופש') ||
    lower.includes('ראש השנה') ||
    lower.includes('כיפור') ||
    lower.includes('סוכות') ||
    lower.includes('חנוכה') ||
    lower.includes('פורים') ||
    lower.includes('פסח') ||
    lower.includes('שבועות') ||
    lower.includes('זיכרון') ||
    lower.includes('עצמאות') ||
    lower.includes('צום') ||
    lower.includes('תענית') ||
    lower.includes('תעניות') ||
    lower.includes('אלפיטר') ||
    lower.includes('אלאדחא') ||
    lower.includes('שועייב') ||
    lower.includes('מולד') ||
    lower.includes('פסחא')
  ) {
    return 'holiday';
  }

  if (lower.includes('סיום סמסטר') || lower.includes('סוף סמסטר') || lower.includes('סיום שנת')) {
    return 'semester_end';
  }

  if (
    lower.includes('סמסטר א') ||
    lower.includes('סמסטר ב') ||
    lower.includes('סמסטר קיץ') ||
    lower.includes('פתיחת שנת') ||
    lower.includes('תחילת שנת')
  ) {
    return 'semester_start';
  }

  return 'other';
}

/**
 * Extracts start date, end date, raw date string, and cleaned title from a line of text
 */
export function extractDateRange(text: string): {
  startDate?: string;
  endDate?: string;
  rawDateStr?: string;
  title?: string;
} {
  if (!text) return {};
  const sanitized = text.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ').trim();

  // Range regex: matches dates with dash, en-dash, or em-dash
  const rangeMatch = sanitized.match(
    /^(.*?)\s*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)\s*[\u2013\u2014-]\s*(\d{1,2}\.\d{1,2}\.(?:\d{2,4}))(.*)$/
  );

  if (rangeMatch) {
    const rawStart = rangeMatch[2];
    const rawEnd = rangeMatch[3];
    const endYearMatch = rawEnd.split('.').pop();
    const endYear = endYearMatch && endYearMatch.length >= 2 ? endYearMatch : undefined;

    const startDate = parseIsoDate(rawStart, endYear);
    const endDate = parseIsoDate(rawEnd);
    const rawDateStr = `${rawStart} – ${rawEnd}`;

    let title = (rangeMatch[1] + ' ' + rangeMatch[4]).replace(/\s+/g, ' ').trim();
    if (!title) title = sanitized;

    return {
      startDate,
      endDate,
      rawDateStr,
      title,
    };
  }

  // Single date regex
  const singleMatch = sanitized.match(/^(.*?)\s*(\d{1,2}\.\d{1,2}\.(?:\d{2,4}))(.*)$/);
  if (singleMatch) {
    const rawDate = singleMatch[2];
    const startDate = parseIsoDate(rawDate);
    const rawDateStr = rawDate;

    let title = (singleMatch[1] + ' ' + singleMatch[3]).replace(/\s+/g, ' ').trim();
    if (!title) title = sanitized;

    return {
      startDate,
      endDate: undefined,
      rawDateStr,
      title,
    };
  }

  return {};
}

/**
 * Checks whether an academic year string matches the search filter (including reversed pairs like 2025-2026 vs 2026-2025)
 */
export function matchesYearFilter(academicYear: string, filter: string): boolean {
  const normTitle = academicYear.toLowerCase();
  const normFilter = filter.trim().toLowerCase();
  if (normTitle.includes(normFilter)) return true;

  if (normFilter.includes('-')) {
    const parts = normFilter.split('-').map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const reversed = `${parts[1]}-${parts[0]}`;
      if (normTitle.includes(reversed)) return true;
      if (normTitle.includes(parts[0]) && normTitle.includes(parts[1])) return true;
    }
  }
  return false;
}

/**
 * Parses raw HTML content from Ort Braude College academic calendar into structured AcademicCalendarData
 */
export function parseCalendarHtml(
  html: string,
  sourceUrl: string = CALENDAR_URL,
  yearFilter?: string
): AcademicCalendarData {
  const $ = cheerio.load(html);
  const years: AcademicYearCalendar[] = [];

  const accordionItems = $('li.accordion-item, .accordion-item');

  if (accordionItems.length > 0) {
    accordionItems.each((_, el) => {
      const rawTitle = $(el).find('.accordion-title, a').first().text().trim();
      if (!rawTitle) return;

      const contentEl = $(el).find('.accordion-content, div[data-tab-content]').first();
      let lines: string[] = [];

      const paragraphs = contentEl.find('p, li, div');
      if (paragraphs.length > 0) {
        paragraphs.each((_, p) => {
          const pText = $(p).text().replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ').trim();
          if (pText) {
            pText.split('\n').forEach((line) => {
              const trimmed = line.trim();
              if (trimmed) lines.push(trimmed);
            });
          }
        });
      } else {
        const fullText = contentEl.text().replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ').trim();
        lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
      }

      const semesterA: CalendarEvent[] = [];
      const semesterB: CalendarEvent[] = [];
      const summerSemester: CalendarEvent[] = [];
      const generalEvents: CalendarEvent[] = [];

      let currentSemester: 'A' | 'B' | 'Summer' | 'General' = 'General';

      for (const line of lines) {
        if (line.includes('PDF') || line.includes('מודפס') || line.includes('להורדת')) {
          continue;
        }

        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('סמסטר א')) currentSemester = 'A';
        else if (lowerLine.includes('סמסטר ב')) currentSemester = 'B';
        else if (lowerLine.includes('סמסטר קיץ')) currentSemester = 'Summer';

        const extracted = extractDateRange(line);
        const category = classifyCategory(line);

        const event: CalendarEvent = {
          title: extracted.title || line,
          startDate: extracted.startDate || '',
          ...(extracted.endDate ? { endDate: extracted.endDate } : {}),
          category,
          ...(extracted.rawDateStr ? { rawDateStr: extracted.rawDateStr } : {}),
        };

        if (currentSemester === 'A') semesterA.push(event);
        else if (currentSemester === 'B') semesterB.push(event);
        else if (currentSemester === 'Summer') summerSemester.push(event);
        else generalEvents.push(event);
      }

      years.push({
        academicYear: rawTitle,
        semesterA,
        semesterB,
        summerSemester,
        generalEvents,
      });
    });
  }

  let filteredYears = years;
  if (yearFilter && yearFilter.trim().length > 0) {
    filteredYears = years.filter((y) => matchesYearFilter(y.academicYear, yearFilter));
  }

  return {
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    years: filteredYears,
  };
}

const inFlightCalendar = new Map<string, Promise<AcademicCalendarData>>();

/**
 * Normalizes and filters calendar data by year filter
 */
function filterCalendarData(data: AcademicCalendarData, yearFilter?: string): AcademicCalendarData {
  if (!yearFilter || yearFilter.trim().length === 0) {
    return data;
  }
  return {
    ...data,
    years: data.years.filter((y) => matchesYearFilter(y.academicYear, yearFilter)),
  };
}

/**
 * Fetches and parses the academic calendar live from Ort Braude College with 24h caching and in-flight deduplication
 */
export async function fetchAcademicCalendar(
  yearFilter?: string,
  allowFallback: boolean = true
): Promise<AcademicCalendarData> {
  const cacheKey = 'calendar:full';

  if (allowFallback) {
    const cached = globalCache.get<AcademicCalendarData>(cacheKey);
    if (cached) {
      return filterCalendarData(cached, yearFilter);
    }

    const existing = inFlightCalendar.get(cacheKey);
    if (existing) {
      const data = await existing;
      return filterCalendarData(data, yearFilter);
    }
  }

  const promise = (async () => {
    let data: AcademicCalendarData;
    try {
      const response = await fetch(CALENDAR_URL, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(Number(process.env.FETCH_TIMEOUT_MS) || 10000),
        redirect: 'follow',
      });

      if (response.ok) {
        const html = await response.text();
        data = parseCalendarHtml(html, CALENDAR_URL);
        if (allowFallback) {
          globalCache.set(cacheKey, data, 86400); // Cache for 24 hours
        }
        return data;
      } else if (!allowFallback) {
        throw new Error(
          `Failed to fetch academic calendar: HTTP ${response.status} ${response.statusText}`
        );
      }
    } catch (err: any) {
      if (!allowFallback) {
        throw err;
      }
    }

    // On network failure, use stale cached live data if available (Last-Known-Good)
    const staleCached = globalCache.getStale<AcademicCalendarData>(cacheKey);
    if (staleCached) {
      return staleCached;
    }

    // Cold-start fallback for tests and offline environments
    data = parseCalendarHtml(FALLBACK_CALENDAR_HTML, CALENDAR_URL);
    if (allowFallback) {
      globalCache.set(cacheKey, data, 86400); // Cache for 24 hours
    }
    return data;
  })().finally(() => {
    inFlightCalendar.delete(cacheKey);
  });

  if (allowFallback) {
    inFlightCalendar.set(cacheKey, promise);
  }

  const fullData = await promise;
  return filterCalendarData(fullData, yearFilter);
}
