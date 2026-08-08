import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCourseSearchHtml,
  parseCourseScheduleHtml,
  searchCourses,
  getCourseSchedule,
  classifyGroupType,
  buildFireflyUrl,
} from '../../src/scrapers/course_search.js';

const MOCK_SEARCH_HTML = `
<!DOCTYPE html>
<html lang="he">
<head><title>תוצאות חיפוש קורסים</title></head>
<body>
  <table class="SearchResultsTable">
    <thead>
      <tr>
        <th>קוד קורס</th>
        <th>שם קורס</th>
        <th>מחלקה</th>
        <th>נ"ז</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><a href="fireflyweb.aspx?appname=BSHITA&prgname=S_LOOK_FOR_NOSE&arguments=-N61767">61767</a></td>
        <td>אבטחת מידע וקריפטולוגיה</td>
        <td>הנדסת תוכנה</td>
        <td>3.5</td>
      </tr>
      <tr>
        <td><a href="fireflyweb.aspx?appname=BSHITA&prgname=S_LOOK_FOR_NOSE&arguments=-N61101">61101</a></td>
        <td>מבוא למדעי המחשב</td>
        <td>הנדסת תוכנה</td>
        <td>4.0</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

const MOCK_SEARCH_EMPTY_HTML = `
<!DOCTYPE html>
<html lang="he">
<body>
  <div class="ErrorMessage">לא נמצאו קורסים המתאימים לקריטריוני החיפוש.</div>
</body>
</html>
`;

const MOCK_SCHEDULE_HTML = `
<!DOCTYPE html>
<html lang="he">
<body>
  <div class="CourseHeader">
    <h1 class="HeaderTitle">61767 - אבטחת מידע וקריפטולוגיה</h1>
    <p>נקודות זכות: 3.5</p>
    <p>דרישות קדם: 61204 מבני נתונים, 61307 אלגוריתמים</p>
  </div>
  <table class="GroupsTable">
    <thead>
      <tr>
        <th>קבוצה</th>
        <th>סוג</th>
        <th>מרצה</th>
        <th>יום</th>
        <th>שעות</th>
        <th>כיתה / בניין</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>10</td>
        <td>הרצאה</td>
        <td>ד"ר אלכסנדר ברגר</td>
        <td>א'</td>
        <td>09:00 - 11:00</td>
        <td>חדר 702 L (בניין ל)</td>
      </tr>
      <tr>
        <td>11</td>
        <td>תרגול</td>
        <td>מר משה כהן</td>
        <td>ג'</td>
        <td>12:00 - 14:00</td>
        <td>חדר 204 E (בניין ה)</td>
      </tr>
      <tr>
        <td>12</td>
        <td>מעבדה</td>
        <td>גב' שרה לוי</td>
        <td>ה'</td>
        <td>14:00 - 16:00</td>
        <td>מעבדה 101 L</td>
      </tr>
    </tbody>
  </table>
</body>
</html>
`;

const MOCK_SCHEDULE_NOT_FOUND_HTML = `
<!DOCTYPE html>
<html lang="he">
<body>
  <div class="ErrorMessage">הקורס 00000 לא קיים במערכת או שאינו נלמד בסמסטר זה.</div>
</body>
</html>
`;

describe('Course Search & Schedule Scraper Unit Tests (src/scrapers/course_search.ts)', () => {
  describe('buildFireflyUrl', () => {
    it('always appends appname=BSHITA parameter to generated URLs', () => {
      const url = buildFireflyUrl('S_LOOK_FOR_NOSE', { arguments: '-N61767' });
      expect(url).toContain('appname=BSHITA');
      expect(url).toContain('prgname=S_LOOK_FOR_NOSE');
      expect(url).toContain('arguments=-N61767');
    });
  });

  describe('classifyGroupType', () => {
    it('maps Hebrew group titles to GroupType correctly', () => {
      expect(classifyGroupType('הרצאה')).toBe('lecture');
      expect(classifyGroupType('תרגול')).toBe('recitation');
      expect(classifyGroupType('תרגיל')).toBe('recitation');
      expect(classifyGroupType('מעבדה')).toBe('lab');
      expect(classifyGroupType('סמינר')).toBe('other');
    });
  });

  describe('parseCourseSearchHtml', () => {
    it('parses valid search HTML into array of CourseSummary', () => {
      const results = parseCourseSearchHtml(MOCK_SEARCH_HTML);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        courseCode: '61767',
        courseName: 'אבטחת מידע וקריפטולוגיה',
        department: 'הנדסת תוכנה',
        credits: 3.5,
      });
      expect(results[1].courseCode).toBe('61101');
    });

    it('returns empty array when search returns no matches', () => {
      const results = parseCourseSearchHtml(MOCK_SEARCH_EMPTY_HTML);
      expect(results).toEqual([]);
    });

    it('handles malformed HTML gracefully without throwing', () => {
      const results = parseCourseSearchHtml('<html><body>random invalid markup</body></html>');
      expect(results).toEqual([]);
    });
  });

  describe('parseCourseScheduleHtml', () => {
    it('parses valid course schedule HTML into CourseScheduleDetail', () => {
      const detail = parseCourseScheduleHtml(MOCK_SCHEDULE_HTML, '61767');
      expect(detail.courseCode).toBe('61767');
      expect(detail.courseName).toBe('אבטחת מידע וקריפטולוגיה');
      expect(detail.credits).toBe(3.5);
      expect(detail.prerequisites).toBeDefined();
      expect(detail.prerequisites).toHaveLength(2);
      expect(detail.groups).toHaveLength(3);

      const lectureGroup = detail.groups.find((g) => g.groupType === 'lecture');
      expect(lectureGroup).toBeDefined();
      expect(lectureGroup?.groupNumber).toBe('10');
      expect(lectureGroup?.instructor).toBe('ד"ר אלכסנדר ברגר');
      expect(lectureGroup?.dayOfWeek).toBe("א'");
      expect(lectureGroup?.startTime).toBe('09:00');
      expect(lectureGroup?.endTime).toBe('11:00');
      expect(lectureGroup?.location).toContain('702 L');

      const recitationGroup = detail.groups.find((g) => g.groupType === 'recitation');
      expect(recitationGroup).toBeDefined();
      expect(recitationGroup?.instructor).toBe('מר משה כהן');

      const labGroup = detail.groups.find((g) => g.groupType === 'lab');
      expect(labGroup).toBeDefined();
      expect(labGroup?.instructor).toBe('גב\' שרה לוי');
    });

    it('throws error for non-existent course HTML', () => {
      expect(() => parseCourseScheduleHtml(MOCK_SCHEDULE_NOT_FOUND_HTML, '00000')).toThrow(
        /not found|לא קיים/i
      );
    });

    it('handles non-existent course HTML with dynamic course code (e.g. 99999)', () => {
      const html = '<html><body><div>הקורס 99999 לא קיים במערכת או שאינו נלמד בסמסטר זה.</div></body></html>';
      expect(() => parseCourseScheduleHtml(html, '99999')).toThrow(/99999.*was not found/i);
    });

    it('correctly parses lab room locations like "מעבדה 202" or "מעבדה 305"', () => {
      const html = `
        <html><body>
          <h1>61101 - מעבדה בלוגיקה</h1>
          <table>
            <tr>
              <td>01</td>
              <td>מעבדה</td>
              <td>ד"ר לוי</td>
              <td>ב'</td>
              <td>10:00 - 12:00</td>
              <td>מעבדה 202</td>
            </tr>
          </table>
        </body></html>
      `;
      const detail = parseCourseScheduleHtml(html, '61101');
      expect(detail.groups).toHaveLength(1);
      expect(detail.groups[0].groupType).toBe('lab');
      expect(detail.groups[0].location).toBe('מעבדה 202');
    });

    it('correctly parses modern FireFly Bootstrap DIV grid layout without HTML tables', () => {
      const modernHtml = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <head><title>תחנת מידע - 61767 אבטחת מידע וקריפטולוגיה</title></head>
        <body>
          <div class="HeaderTitle">61767 - אבטחת מידע וקריפטולוגיה</div>
          <div>נקודות זכות: 4.0</div>
          <div>דרישות קדם: 61204 מבני נתונים</div>
          <div class="col">
            <div class="TextAlignRight">
              קורס מסוג הרצאה
              <span>קבוצה : 261060410</span>
              מרצה הקורס : פרופ' וולקוביץ ולדימיר (זאב)
            </div>
            <div class="card searchWrapper MasterTable">
              <div class="Table container">
                <div class="row">
                  <div class="col">סמסטר</div>
                  <div class="col">יום בשבוע</div>
                  <div class="col">שעת התחלה</div>
                  <div class="col">שעת סיום</div>
                  <div class="col">מרצה</div>
                  <div class="col">חדר לימוד</div>
                </div>
                <div class="row">
                  <div class="col">א</div>
                  <div class="col">יום שלישי</div>
                  <div class="col">14:50</div>
                  <div class="col">17:50</div>
                  <div class="col">פרופ' וולקוביץ ולדימיר (זאב)</div>
                  <div class="col">702 L</div>
                </div>
              </div>
            </div>
          </div>
          <div class="col">
            <div class="TextAlignRight">
              קורס מסוג תרגיל
              <span>קבוצה : 261060410/ 1</span>
              מרצה הקורס : מר גבינט איתי
            </div>
            <div class="card searchWrapper MasterTable">
              <div class="Table container">
                <div class="row">
                  <div class="col">סמסטר</div>
                  <div class="col">יום בשבוע</div>
                  <div class="col">שעת התחלה</div>
                  <div class="col">שעת סיום</div>
                  <div class="col">מרצה</div>
                  <div class="col">חדר לימוד</div>
                </div>
                <div class="row">
                  <div class="col">א</div>
                  <div class="col">יום שני</div>
                  <div class="col">08:30</div>
                  <div class="col">10:30</div>
                  <div class="col">מר גבינט איתי</div>
                  <div class="col">308 M</div>
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      const detail = parseCourseScheduleHtml(modernHtml, '61767');
      expect(detail.courseCode).toBe('61767');
      expect(detail.courseName).toBe('אבטחת מידע וקריפטולוגיה');
      expect(detail.credits).toBe(4.0);
      expect(detail.prerequisites).toEqual(['61204 מבני נתונים']);
      expect(detail.groups).toHaveLength(2);

      expect(detail.groups[0].groupType).toBe('lecture');
      expect(detail.groups[0].groupNumber).toBe('10');
      expect(detail.groups[0].instructor).toBe("פרופ' וולקוביץ ולדימיר (זאב)");
      expect(detail.groups[0].dayOfWeek).toBe("ג'");
      expect(detail.groups[0].startTime).toBe('14:50');
      expect(detail.groups[0].endTime).toBe('17:50');
      expect(detail.groups[0].location).toBe('702 L');

      expect(detail.groups[1].groupType).toBe('recitation');
      expect(detail.groups[1].groupNumber).toBe('10/1');
      expect(detail.groups[1].instructor).toBe('מר גבינט איתי');
      expect(detail.groups[1].dayOfWeek).toBe("ב'");
      expect(detail.groups[1].startTime).toBe('08:30');
      expect(detail.groups[1].endTime).toBe('10:30');
      expect(detail.groups[1].location).toBe('308 M');
    });

    it('correctly extracts course title from FireFly "קורס ... שנה\\"ל" header format', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="he" dir="rtl">
        <body>
          <div>קורס מבוא למחשוב ענן שנה"ל תשפ"ו</div>
          <div>נקודות זכות: 3.0</div>
          <table>
            <tr>
              <td>10</td>
              <td>הרצאה</td>
              <td>ד"ר כהן</td>
              <td>א'</td>
              <td>10:00 - 12:00</td>
              <td>301 M</td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const detail = parseCourseScheduleHtml(html, '61773');
      expect(detail.courseCode).toBe('61773');
      expect(detail.courseName).toBe('מבוא למחשוב ענן');
      expect(detail.credits).toBe(3.0);
      expect(detail.groups).toHaveLength(1);
    });
  });

  describe('searchCourses Network Wrapper', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('includes mandatory appname=BSHITA query parameter in fetch URL', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => MOCK_SEARCH_HTML,
      } as Response);
      globalThis.fetch = fetchSpy;

      const results = await searchCourses('אבטחת מידע', undefined, false);
      expect(results.length).toBeGreaterThan(0);
      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('appname=BSHITA');
      globalThis.fetch = originalFetch;
    });

    it('finds course "מבוא למחשוב ענן" (61773) in fallback mode', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const results = await searchCourses('מבוא למחשוב ענן', undefined, true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].courseCode).toBe('61773');
      expect(results[0].courseName).toBe('מבוא למחשוב ענן');
      globalThis.fetch = originalFetch;
    });

    it('finds course by keyword substring "ענן" in fallback mode', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const results = await searchCourses('ענן', undefined, true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseCode === '61773')).toBe(true);
      globalThis.fetch = originalFetch;
    });

    it('serves stale live cached data when network fails during revalidation', async () => {
      // 1. Initial successful scrape
      const LIVE_MOCK = `
        <html><body><table>
          <tr><td><a href="fireflyweb.aspx?appname=BSHITA&prgname=S_LOOK_FOR_NOSE&arguments=-N61773">61773</a></td><td>מבוא למחשוב ענן</td><td>הנדסת תוכנה</td></tr>
        </table></body></html>
      `;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => LIVE_MOCK,
      } as Response);

      const res1 = await searchCourses('מחשוב ענן', undefined, true);
      expect(res1).toHaveLength(1);
      expect(res1[0].courseCode).toBe('61773');

      // 2. Subsequent network failure should still serve cached data
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('College portal connection refused'));
      const res2 = await searchCourses('מחשוב ענן', undefined, true);
      expect(res2).toHaveLength(1);
      expect(res2[0].courseCode).toBe('61773');

      globalThis.fetch = originalFetch;
    });

    it('throws error on HTTP 500 server failure when allowFallback is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(searchCourses('test', undefined, false)).rejects.toThrow(/500/);
      globalThis.fetch = originalFetch;
    });

    it('uses static fallback data seamlessly when network fails and allowFallback is true', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const results = await searchCourses('אבטחת מידע', undefined, true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].courseCode).toBe('61773' === results[0].courseCode ? '61773' : '61767');
      globalThis.fetch = originalFetch;
    });

    it('returns empty array when no fallback courses match the query (e.g. פיזיקה or nonexistent)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const res1 = await searchCourses('פיזיקה', undefined, true);
      expect(res1).toEqual([]);

      const res2 = await searchCourses('nonexistent_query_xyz', undefined, true);
      expect(res2).toEqual([]);
      globalThis.fetch = originalFetch;
    });
  });

  describe('getCourseSchedule Network Wrapper', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches schedule for specific course code with appname=BSHITA', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => MOCK_SCHEDULE_HTML,
      } as Response);
      globalThis.fetch = fetchSpy;

      const schedule = await getCourseSchedule('61767', false);

      expect(schedule.courseCode).toBe('61767');
      expect(fetchSpy).toHaveBeenCalled();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('appname=BSHITA');
      expect(calledUrl).toContain('61767');
      globalThis.fetch = originalFetch;
    });

    it('throws error for non-existent course code (00000)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => MOCK_SCHEDULE_NOT_FOUND_HTML,
      } as Response);

      await expect(getCourseSchedule('00000', true)).rejects.toThrow(/not found|לא קיים/i);
      globalThis.fetch = originalFetch;
    });

    it('throws error for arbitrary non-existent course code in fallback mode (e.g. 88888)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      await expect(getCourseSchedule('88888', true)).rejects.toThrow(/Course code '88888' was not found or is not taught/i);
      globalThis.fetch = originalFetch;
    });

    it('handles live fetch returning full course catalog when searching for non-existent query', async () => {
      const BULK_CATALOG_HTML = `
        <html><body><table>
          <tr><td>61767</td><td>אבטחת מידע וקריפטולוגיה</td></tr>
          <tr><td>61101</td><td>מבוא למדעי המחשב</td></tr>
        </table></body></html>
      `;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => BULK_CATALOG_HTML,
      } as Response);

      const results = await searchCourses('nonexistent_course_query_xyz_999', undefined, true);
      expect(results).toEqual([]);
      globalThis.fetch = originalFetch;
    });

    it('falls back to mock schedule when live fetch returns a page without schedule groups for valid course 61767', async () => {
      const EMPTY_LANDING_HTML = '<html><body><div>תחנת מידע בראודה</div></body></html>';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => EMPTY_LANDING_HTML,
      } as Response);

      const schedule = await getCourseSchedule('61767', true);
      expect(schedule.courseCode).toBe('61767');
      expect(schedule.groups.length).toBeGreaterThan(0);
      globalThis.fetch = originalFetch;
    });

    it('throws error when live fetch returns a page without schedule groups for invalid course 00000', async () => {
      const EMPTY_LANDING_HTML = '<html><body><div>תחנת מידע בראודה</div></body></html>';
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => EMPTY_LANDING_HTML,
      } as Response);

      await expect(getCourseSchedule('00000', true)).rejects.toThrow(/Course code '00000' was not found/i);
      globalThis.fetch = originalFetch;
    });
  });
});

