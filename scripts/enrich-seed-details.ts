/**
 * Resumable enrichment of db_seed.json with credits, syllabus, and rooms.
 * Skips courses that already have credits + description.
 * Run: npx vite-node scripts/enrich-seed-details.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  enrichWithCourseDetails,
} from '../src/scrapers/course_search.js';
import { openLatestYearSessionWithRetry } from '../src/scrapers/firefly.js';
import type { CourseScheduleDetail, CourseSummary } from '../src/types/index.js';

const SEED_PATH = new URL('../src/data/db_seed.json', import.meta.url);

function save(seed: unknown) {
  writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as {
    fireflyYear?: string;
    courses: CourseSummary[];
    schedules: Record<string, CourseScheduleDetail>;
    [key: string]: unknown;
  };

  const missing = seed.courses.filter((c) => !c.credits || !seed.schedules[c.courseCode]?.description);
  console.log(`Courses missing credits/syllabus: ${missing.length}/${seed.courses.length}`);
  if (missing.length === 0) {
    return;
  }

  const session = await openLatestYearSessionWithRetry(10000, seed.fireflyYear, 6);
  const { detailsCount } = await enrichWithCourseDetails(
    session,
    seed.courses,
    seed.schedules,
    8000
  );

  let withCredits = 0;
  for (const course of seed.courses) {
    const schedule = seed.schedules[course.courseCode];
    if (schedule?.credits && !course.credits) course.credits = schedule.credits;
    if (schedule?.description && !course.description) course.description = schedule.description;
    if (schedule?.syllabusUrl && !course.syllabusUrl) course.syllabusUrl = schedule.syllabusUrl;
    if (course.credits) withCredits += 1;
  }

  seed.totalSchedules = Object.keys(seed.schedules).length;
  save(seed);
  console.log(`Enriched detail pages this run: ${detailsCount}. Courses with credits: ${withCredits}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
