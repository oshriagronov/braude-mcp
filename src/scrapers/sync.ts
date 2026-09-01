import { fetchAcademicCalendar } from './calendar.js';
import {
  academicYearRange,
  fetchAllCoursesCatalog,
  fetchLatestTimetable,
} from './course_search.js';
import { fallbackAcademicYear, openLatestYearSession } from './firefly.js';
import { syncDatabaseFromScrape, type D1Database } from '../db/client.js';
import type { CourseScheduleDetail, CourseSummary } from '../types/index.js';

export interface SyncResult {
  success: boolean;
  coursesCount: number;
  schedulesCount: number;
  calendarSynced: boolean;
  latestYear: string;
  timestamp: string;
}

/**
 * Scrapes the latest published Braude catalog + weekly timetable and persists
 * only real portal data. Academic year is read from the FireFly dropdown.
 */
export async function scrapeLatestSnapshot(timeoutMs: number = 15000): Promise<{
  yearLabel: string;
  latestYear: string;
  courses: CourseSummary[];
  schedules: Record<string, CourseScheduleDetail>;
  calendar: Awaited<ReturnType<typeof fetchAcademicCalendar>>;
}> {
  const session = await openLatestYearSession(timeoutMs);
  const latestYear = academicYearRange(session.year);
  const calendarPromise = fetchAcademicCalendar(latestYear);

  // FireFly session POSTs must stay sequential — the portal is cookie-stateful.
  const courses = await fetchAllCoursesCatalog(session.year, timeoutMs, session);
  const schedules = await fetchLatestTimetable(session, Math.max(timeoutMs, 20000));
  const calendar = await calendarPromise;

  // Attach catalog names onto timetable entries (and vice versa)
  for (const course of courses) {
    const schedule = schedules[course.courseCode];
    if (schedule && course.courseName) {
      schedule.courseName = course.courseName;
      if (course.credits) {
        schedule.credits = course.credits;
      }
    }
  }

  return {
    yearLabel: session.year,
    latestYear,
    courses,
    schedules,
    calendar,
  };
}

/**
 * Background synchronization routine executed by Cloudflare Cron Trigger (every 3 days)
 */
export async function syncCatalogAndCalendar(db?: D1Database): Promise<SyncResult> {
  console.log('[SYNC] Starting background sync for Ort Braude courses & calendar...');

  let coursesCount = 0;
  let schedulesCount = 0;
  let calendarSynced = false;
  let latestYear = academicYearRange(fallbackAcademicYear());

  try {
    const snapshot = await scrapeLatestSnapshot();
    latestYear = snapshot.latestYear;
    coursesCount = snapshot.courses.length;
    schedulesCount = Object.keys(snapshot.schedules).length;
    calendarSynced = !!snapshot.calendar;

    console.log(
      `[SYNC] Latest academic year ${latestYear} (FireFly ${snapshot.yearLabel}): ${coursesCount} courses, ${schedulesCount} schedules`
    );

    if (db && (snapshot.courses.length > 0 || Object.keys(snapshot.schedules).length > 0)) {
      await syncDatabaseFromScrape(db, {
        courses: snapshot.courses,
        calendar: snapshot.calendar,
        schedules: snapshot.schedules,
        replaceAll: true,
      });
      console.log('[SYNC] Successfully persisted scraped data into Cloudflare D1.');
    }

    return {
      success: true,
      coursesCount,
      schedulesCount,
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
      calendarSynced,
      latestYear,
      timestamp: new Date().toISOString(),
    };
  }
}
