import { fetchAcademicCalendar } from './calendar.js';
import { fetchAllCoursesCatalog, detectLatestAcademicYear } from './course_search.js';
import { syncDatabaseFromScrape, type D1Database } from '../db/client.js';

/**
 * Background synchronization routine executed by Cloudflare Cron Trigger (every 3 days)
 */
export async function syncCatalogAndCalendar(db?: D1Database): Promise<{
  success: boolean;
  coursesCount: number;
  calendarSynced: boolean;
  latestYear: string;
  timestamp: string;
}> {
  console.log('[SYNC] Starting background sync for Ort Braude courses & calendar...');

  let coursesCount = 0;
  let calendarSynced = false;
  let latestYear = '2026-2027';

  try {
    // 0. Dynamically detect latest academic year from Braude portal
    const detectedYear = await detectLatestAcademicYear();
    latestYear = `${Number(detectedYear) - 1}-${detectedYear}`;
    console.log(`[SYNC] Detected latest academic year: ${latestYear} (Gregorian ${detectedYear})`);

    // 1. Fetch full course catalog across latest semester / year
    const scrapedCourses = await fetchAllCoursesCatalog(detectedYear);
    coursesCount = scrapedCourses.length;
    console.log(`[SYNC] Successfully scraped ${coursesCount} courses from Braude portal for latest year.`);

    // 2. Fetch academic calendar for latest year
    const calendarData = await fetchAcademicCalendar(latestYear);
    calendarSynced = !!calendarData;
    console.log('[SYNC] Successfully scraped academic calendar for latest year.');

    // 3. Upsert to D1 database if available
    if (db) {
      await syncDatabaseFromScrape(db, {
        courses: scrapedCourses,
        calendar: calendarData,
      });
      console.log('[SYNC] Successfully persisted synced data into Cloudflare D1.');
    }

    return {
      success: true,
      coursesCount,
      calendarSynced,
      latestYear,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[SYNC] Background sync encountered an error:', error?.message || error);
    return {
      success: false,
      coursesCount,
      calendarSynced,
      latestYear,
      timestamp: new Date().toISOString(),
    };
  }
}
