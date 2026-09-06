import { fetchAcademicCalendar } from './calendar.js';
import {
  academicYearRange,
  enrichWithCourseDetails,
  fetchAllCoursesCatalog,
  fetchLatestTimetable,
} from './course_search.js';
import { fallbackAcademicYear, openLatestYearSessionWithRetry } from './firefly.js';
import { ingestSyllabusPdfs } from './syllabus_pdf.js';
import {
  applyStoredSyllabi,
  loadCourseSyllabiFromDb,
  syncDatabaseFromScrape,
  upsertCourseSyllabi,
  type D1Database,
} from '../db/client.js';
import type { CourseScheduleDetail, CourseSummary } from '../types/index.js';

export interface SyncOptions {
  /** Fetch per-course FireFly HTML details (credits, rooms). Off by default so /sync stays within Worker limits. */
  enrichDetails?: boolean;
  /**
   * Fetch every public syllabus PDF into D1. Defaults to true when a D1 binding is
   * passed (cron / POST /sync). Tests without DB skip live PDF downloads.
   */
  ingestPdfs?: boolean;
}

export interface SyncResult {
  success: boolean;
  coursesCount: number;
  schedulesCount: number;
  detailsCount: number;
  pdfsIngested: number;
  calendarSynced: boolean;
  latestYear: string;
  timestamp: string;
}

/**
 * Scrapes the latest published Braude catalog + weekly timetable.
 * Academic year is read from the FireFly dropdown. PDF ingest happens in
 * syncCatalogAndCalendar so D1 can overlay and persist incrementally.
 */
export async function scrapeLatestSnapshot(
  timeoutMs: number = 15000,
  options: SyncOptions = {}
): Promise<{
  yearLabel: string;
  latestYear: string;
  courses: CourseSummary[];
  schedules: Record<string, CourseScheduleDetail>;
  calendar: Awaited<ReturnType<typeof fetchAcademicCalendar>>;
  detailsCount: number;
}> {
  const session = await openLatestYearSessionWithRetry(timeoutMs);
  const latestYear = academicYearRange(session.year);
  const calendarPromise = fetchAcademicCalendar(latestYear);

  // FireFly session POSTs must stay sequential — the portal is cookie-stateful.
  const courses = await fetchAllCoursesCatalog(session.year, timeoutMs, session);
  const schedules = await fetchLatestTimetable(session, Math.max(timeoutMs, 20000));
  const calendar = await calendarPromise;

  for (const course of courses) {
    const schedule = schedules[course.courseCode];
    if (schedule && course.courseName) {
      schedule.courseName = course.courseName;
      if (course.credits) {
        schedule.credits = course.credits;
      }
    }
  }

  let detailsCount = 0;
  if (options.enrichDetails === true) {
    const enriched = await enrichWithCourseDetails(session, courses, schedules, 8000);
    detailsCount = enriched.detailsCount;
  }

  return {
    yearLabel: session.year,
    latestYear,
    courses,
    schedules,
    calendar,
    detailsCount,
  };
}

/**
 * Background synchronization: catalog, timetable, calendar, and full syllabus PDFs
 * into D1. Cron (every 3 days) and POST /sync. MCP queries never scrape.
 */
export async function syncCatalogAndCalendar(
  db?: D1Database,
  options: SyncOptions = {}
): Promise<SyncResult> {
  console.log('[SYNC] Starting background sync for Ort Braude courses, calendar, and syllabus PDFs...');

  let coursesCount = 0;
  let schedulesCount = 0;
  let detailsCount = 0;
  let pdfsIngested = 0;
  let calendarSynced = false;
  let latestYear = academicYearRange(fallbackAcademicYear());
  const ingestPdfs = options.ingestPdfs ?? Boolean(db);

  try {
    const snapshot = await scrapeLatestSnapshot(15000, options);
    latestYear = snapshot.latestYear;
    coursesCount = snapshot.courses.length;
    schedulesCount = Object.keys(snapshot.schedules).length;
    detailsCount = snapshot.detailsCount;
    calendarSynced = !!snapshot.calendar;

    if (db) {
      const stored = await loadCourseSyllabiFromDb(db);
      applyStoredSyllabi(snapshot.courses, snapshot.schedules, stored);
    } else {
      applyStoredSyllabi(snapshot.courses, snapshot.schedules, new Map());
    }

    if (db && (snapshot.courses.length > 0 || Object.keys(snapshot.schedules).length > 0)) {
      await syncDatabaseFromScrape(db, {
        courses: snapshot.courses,
        calendar: snapshot.calendar,
        schedules: snapshot.schedules,
        replaceAll: true,
      });
      console.log('[SYNC] Persisted catalog and timetable into Cloudflare D1.');
    }

    if (ingestPdfs) {
      const pdfs = await ingestSyllabusPdfs(snapshot.courses, snapshot.schedules, snapshot.yearLabel, {
        timeoutMs: 8000,
        refreshExisting: true,
        onProgress: db
          ? async () => {
              await upsertCourseSyllabi(db, snapshot.courses);
            }
          : undefined,
      });
      pdfsIngested = pdfs.pdfsIngested;

      if (db && pdfsIngested > 0) {
        await upsertCourseSyllabi(db, snapshot.courses);
      }
    }

    console.log(
      `[SYNC] Latest academic year ${latestYear} (FireFly ${snapshot.yearLabel}): ${coursesCount} courses, ${schedulesCount} schedules, ${detailsCount} detail pages, ${pdfsIngested} syllabus PDFs`
    );

    return {
      success: true,
      coursesCount,
      schedulesCount,
      detailsCount,
      pdfsIngested,
      calendarSynced,
      latestYear,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[SYNC] Background sync encountered an error:', error?.message || error);
    return {
      success: false,
      coursesCount,
      schedulesCount,
      detailsCount,
      pdfsIngested,
      calendarSynced,
      latestYear,
      timestamp: new Date().toISOString(),
    };
  }
}
