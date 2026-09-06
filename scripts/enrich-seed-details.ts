/**
 * Resumable enrichment of db_seed.json with credits, syllabus, rooms, and PDF text.
 * Skips courses that already have credits + description; PDF ingest skips courses
 * that already have syllabusText.
 * Run: npx vite-node scripts/enrich-seed-details.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  enrichWithCourseDetails,
} from '../src/scrapers/course_search.js';
import { openLatestYearSessionWithRetry } from '../src/scrapers/firefly.js';
import { ingestSyllabusPdfs } from '../src/scrapers/syllabus_pdf.js';
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

  const missingDetails = seed.courses.filter(
    (c) => !c.credits || !seed.schedules[c.courseCode]?.description
  );
  const missingPdfs = seed.courses.filter(
    (c) => !c.syllabusText && !seed.schedules[c.courseCode]?.syllabusText
  );
  console.log(`Courses missing credits/syllabus: ${missingDetails.length}/${seed.courses.length}`);
  console.log(`Courses missing ingested PDF text: ${missingPdfs.length}/${seed.courses.length}`);
  if (missingDetails.length === 0 && missingPdfs.length === 0) {
    return;
  }

  const pdfsOnly = process.argv.includes('--pdfs-only');

  let detailsCount = 0;
  if (!pdfsOnly && missingDetails.length > 0) {
    const session = await openLatestYearSessionWithRetry(10000, seed.fireflyYear, 6);
    const enriched = await enrichWithCourseDetails(session, seed.courses, seed.schedules, 8000);
    detailsCount = enriched.detailsCount;
  }

  let pdfsIngested = 0;
  if (seed.fireflyYear) {
    const pdfs = await ingestSyllabusPdfs(seed.courses, seed.schedules, seed.fireflyYear, {
      timeoutMs: 8000,
      refreshExisting: false,
      onProgress: () => {
        save(seed);
      },
    });
    pdfsIngested = pdfs.pdfsIngested;
  } else {
    console.warn('seed.fireflyYear missing; skipping syllabus PDF ingest');
  }

  let withCredits = 0;
  let withPdfText = 0;
  for (const course of seed.courses) {
    const schedule = seed.schedules[course.courseCode];
    if (schedule?.credits && !course.credits) course.credits = schedule.credits;
    if (schedule?.description && !course.description) course.description = schedule.description;
    if (schedule?.syllabusUrl && !course.syllabusUrl) course.syllabusUrl = schedule.syllabusUrl;
    if (schedule?.syllabusText && !course.syllabusText) course.syllabusText = schedule.syllabusText;
    if (course.credits) withCredits += 1;
    if (course.syllabusText) withPdfText += 1;
  }

  // Keep syllabus PDF text on catalog records only; query overlay copies it onto schedules.
  for (const schedule of Object.values(seed.schedules)) {
    delete schedule.syllabusText;
  }

  seed.totalSchedules = Object.keys(seed.schedules).length;
  save(seed);
  console.log(
    `Enriched detail pages this run: ${detailsCount}. Syllabus PDFs ingested: ${pdfsIngested}. Courses with credits: ${withCredits}. Courses with PDF text: ${withPdfText}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
