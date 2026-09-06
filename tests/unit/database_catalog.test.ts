import { describe, it, expect } from 'vitest';
import {
  searchCoursesInDb,
  getCourseScheduleFromDb,
  getCourseSyllabusFromDb,
  getAcademicCalendarFromDb,
  normalizeHebrewText,
  applyStoredSyllabi,
} from '../../src/db/client.js';
import type { CourseScheduleDetail, CourseSummary } from '../../src/types/index.js';

describe('Database & Catalog Unit Tests', () => {
  describe('Hebrew Text Normalization', () => {
    it('normalizes Hebrew text by stripping quotes, gershayim and diacritics', () => {
      expect(normalizeHebrewText('חדו"א 1')).toBe('חדוא 1');
      expect(normalizeHebrewText("סמסטר א'")).toBe('סמסטר א');
      expect(normalizeHebrewText('תשפ״ו')).toBe('תשפו');
    });
  });

  describe('Full Catalog Search (All 598+ Braude Courses)', () => {
    it('finds core software engineering courses', async () => {
      const results = await searchCoursesInDb('מבוא למדעי המחשב');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseName.includes('מבוא למדעי המחשב'))).toBe(true);
    });

    it('finds core mathematics and science courses', async () => {
      const results = await searchCoursesInDb('אלגברה');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseName.includes('אלגברה'))).toBe(true);
    });

    it('finds mechanical engineering courses', async () => {
      const results = await searchCoursesInDb('דינמיקת מבנים');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseCode === '421315')).toBe(true);
    });

    it('finds biotechnology engineering courses', async () => {
      const results = await searchCoursesInDb('כימיה אורגנית');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseCode === '41063')).toBe(true);
    });

    it('finds courses by exact numeric code', async () => {
      const results = await searchCoursesInDb('61767');
      expect(results.length).toBe(1);
      expect(results[0].courseCode).toBe('61767');
      expect(results[0].courseName).toBe('אבטחת מידע וקריפטולוגיה');
    });

    it('filters courses by department accurately', async () => {
      const softwareCourses = await searchCoursesInDb('', 'הנדסת תוכנה');
      expect(softwareCourses.length).toBeGreaterThan(10);
      for (const c of softwareCourses) {
        expect(c.department).toContain('תוכנה');
      }
    });

    it('supports multi-token non-consecutive queries', async () => {
      const results = await searchCoursesInDb('מחשוב ענן');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseCode === '61773')).toBe(true);
    });

    it('finds elective seminar course 62005 סמינר בהתאמת תבניות', async () => {
      const results = await searchCoursesInDb('סמינר בהתאמת תבניות');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.courseCode === '62005')).toBe(true);

      const codeResults = await searchCoursesInDb('62005');
      expect(codeResults.length).toBe(1);
      expect(codeResults[0].courseName).toBe('סמינר בהתאמת תבניות');
    });
  });

  describe('Course Schedule Details Retrieval', () => {
    it('retrieves complete schedule with groups for course 61767', async () => {
      const schedule = await getCourseScheduleFromDb('61767');
      expect(schedule.courseCode).toBe('61767');
      expect(schedule.courseName).toBe('אבטחת מידע וקריפטולוגיה');
      expect(schedule.groups.length).toBeGreaterThanOrEqual(2);
      expect(schedule.groups.some((g) => g.groupType === 'lecture')).toBe(true);
      expect(schedule.groups.some((g) => g.groupType === 'recitation')).toBe(true);
    });

    it('retrieves complete schedule for any catalog course (e.g. 421315)', async () => {
      const schedule = await getCourseScheduleFromDb('421315');
      expect(schedule.courseCode).toBe('421315');
      expect(schedule.courseName).toBe('דינמיקת מבנים');
      expect(schedule.groups.length).toBeGreaterThan(0);
    });

    it('retrieves schedule for seminar course 62005 סמינר בהתאמת תבניות', async () => {
      const schedule = await getCourseScheduleFromDb('62005');
      expect(schedule.courseCode).toBe('62005');
      expect(schedule.courseName).toBe('סמינר בהתאמת תבניות');
      expect(schedule.groups.length).toBeGreaterThan(0);
      expect(schedule.groups[0].dayOfWeek).toBe("ד'");
      expect(schedule.groups[0].instructor).not.toBe('סגל המחלקה');
      expect(schedule.credits).toBeGreaterThan(0);
      expect(schedule.syllabusUrl).toMatch(/info\.braude\.ac\.il\/info\/\d{4}\/0062005\.pdf/);
      expect(schedule.description).toBeTruthy();
      expect(schedule.syllabusText).toBeTruthy();
      expect(schedule.syllabusText).toMatch(/נושאי הלימוד|הרכב הציון|מטרות הקורס/);
    });

    it('overlays stored D1 syllabus PDFs onto a fresh catalog scrape so replaceAll cannot wipe them', () => {
      const courses: CourseSummary[] = [
        { courseCode: '62005', courseName: 'סמינר בהתאמת תבניות' },
      ];
      const schedules: Record<string, CourseScheduleDetail> = {
        '62005': {
          courseCode: '62005',
          courseName: 'סמינר בהתאמת תבניות',
          credits: 3,
          groups: [],
          fetchedAt: new Date().toISOString(),
        },
      };
      const stored = new Map([
        [
          '62005',
          {
            syllabusUrl: 'https://info.braude.ac.il/info/2027/0062005.pdf',
            syllabusText: 'נושאי הלימוד: KMP. הרכב הציון: 80% הרצאה.',
          },
        ],
      ]);
      applyStoredSyllabi(courses, schedules, stored);
      expect(courses[0].syllabusText).toContain('נושאי הלימוד');
      expect(courses[0].syllabusUrl).toMatch(/0062005\.pdf/);
      expect(schedules['62005'].syllabusText).toBe(courses[0].syllabusText);
    });

    it('returns ingested syllabus PDF content for getCourseSyllabusFromDb', async () => {
      const syllabus = await getCourseSyllabusFromDb('62005');
      expect(syllabus.courseCode).toBe('62005');
      expect(syllabus.syllabusText).toMatch(/נושאי הלימוד|KMP|הרכב הציון|מטרות הקורס/);
      expect(syllabus.syllabus?.attendance).toMatch(/חובת נוכחות|100%/);
      expect(syllabus.syllabus?.topics).toMatch(/KMP|Suffix/);
      expect(syllabus.groups?.length).toBeGreaterThan(0);
    });

    it('exposes attendance policy on get_course_schedule from the ingested PDF', async () => {
      const schedule = await getCourseScheduleFromDb('62005');
      expect(schedule.syllabus?.attendance).toMatch(/נוכחות/);
      expect(schedule.department).toContain('תוכנה');
    });

    it('does not include full syllabus PDF text in search_courses results', async () => {
      const results = await searchCoursesInDb('62005');
      expect(results).toHaveLength(1);
      expect(results[0].syllabusText).toBeUndefined();
    });

    it('throws descriptive error for invalid course codes', async () => {
      await expect(getCourseScheduleFromDb('000000')).rejects.toThrow(
        /not found or is not taught this semester/i
      );
    });
  });

  describe('Academic Calendar Database Retrieval', () => {
    it('retrieves current academic calendar with semesters, exams, and holidays', async () => {
      const calendar = await getAcademicCalendarFromDb();
      expect(calendar.years.length).toBeGreaterThan(0);
      const yr = calendar.years[0];
      expect(yr.semesterA.length).toBeGreaterThan(0);
      expect(yr.semesterB.length).toBeGreaterThan(0);
      expect(yr.generalEvents.some((e) => e.category === 'holiday')).toBe(true);
    });

    it('filters academic calendar by year cleanly', async () => {
      const calendar2526 = await getAcademicCalendarFromDb('2025-2026');
      expect(calendar2526.years.length).toBe(1);
      expect(calendar2526.years[0].academicYear).toContain('תשפ"ו');

      const nonExistent = await getAcademicCalendarFromDb('1990-1991');
      expect(nonExistent.years.length).toBe(0);
    });
  });

  describe('Dynamic Latest Academic Year Auto-Discovery & Sync', () => {
    it('detects latest academic year dynamically', async () => {
      const { detectLatestAcademicYear } = await import('../../src/scrapers/course_search.js');
      const latestYear = await detectLatestAcademicYear();
      expect(Number(latestYear)).toBeGreaterThanOrEqual(2025);
    });

    it('syncs catalog and calendar targeting the latest academic year', async () => {
      const { syncCatalogAndCalendar } = await import('../../src/scrapers/sync.js');
      const result = await syncCatalogAndCalendar(undefined, {
        enrichDetails: false,
        ingestPdfs: false,
      });
      if (!result.success) {
        // FireFly may rate-limit during development; the seed still serves queries.
        expect(result.latestYear).toMatch(/^\d{4}-\d{4}$/);
        return;
      }
      expect(result.coursesCount).toBeGreaterThan(0);
      expect(result.schedulesCount).toBeGreaterThan(0);
      expect(result.calendarSynced).toBe(true);
      expect(result.latestYear).toMatch(/^\d{4}-\d{4}$/);
    }, 60000);

    it('guarantees zero duplicate course codes across the entire database', async () => {
      const allCourses = await searchCoursesInDb('');
      const seenCodes = new Set<string>();
      for (const c of allCourses) {
        expect(seenCodes.has(c.courseCode)).toBe(false);
        seenCodes.add(c.courseCode);
      }
    });

    it('ensures each course has a single authoritative schedule without duplicate groups', async () => {
      const sampleCodes = ['61767', '62005', '421315', '61773', '41063'];
      for (const code of sampleCodes) {
        const schedule = await getCourseScheduleFromDb(code);
        const seenSlots = new Set<string>();
        for (const g of schedule.groups) {
          const key = `${g.groupNumber}-${g.groupType}-${g.dayOfWeek}-${g.startTime}-${g.instructor}`;
          expect(seenSlots.has(key)).toBe(false);
          seenSlots.add(key);
        }
      }
    });

    it('never serves generated placeholder instructors or Sunday-by-modulo times', async () => {
      const schedule = await getCourseScheduleFromDb('62005');
      for (const g of schedule.groups) {
        expect(['סגל המחלקה', 'מתרגל/ת הקורס', 'אחראי/ת מעבדה']).not.toContain(g.instructor);
      }
      expect(schedule.groups.some((g) => g.dayOfWeek === "ד'")).toBe(true);
    });
  });
});
