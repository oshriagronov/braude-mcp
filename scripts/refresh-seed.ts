/**
 * Rebuilds src/data/db_seed.json from the latest FireFly academic year.
 * Run: npx vite-node scripts/refresh-seed.ts
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { scrapeLatestSnapshot } from '../src/scrapers/sync.js';
import type { CourseSummary } from '../src/types/index.js';

const SEED_PATH = new URL('../src/data/db_seed.json', import.meta.url);

async function main() {
  const previous = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as {
    departments?: Array<{ id: string; name: string }>;
    calendar?: unknown;
    courses?: CourseSummary[];
  };

  const deptByCode = new Map<string, string>();
  for (const course of previous.courses || []) {
    if (course.courseCode && course.department) {
      deptByCode.set(course.courseCode, course.department);
    }
  }

  const previousByCode = new Map(
    (previous.courses || []).map((course) => [course.courseCode, course])
  );

  const snapshot = await scrapeLatestSnapshot(20000);

  const courses: CourseSummary[] = snapshot.courses.map((course) => {
    const schedule = snapshot.schedules[course.courseCode];
    const prev = previousByCode.get(course.courseCode);
    return {
      ...course,
      ...(deptByCode.get(course.courseCode) && !course.department
        ? { department: deptByCode.get(course.courseCode) }
        : {}),
      ...(schedule?.credits && !course.credits ? { credits: schedule.credits } : {}),
      ...(schedule?.description && !course.description ? { description: schedule.description } : {}),
      ...(schedule?.syllabusUrl && !course.syllabusUrl ? { syllabusUrl: schedule.syllabusUrl } : {}),
      ...(schedule?.syllabusText && !course.syllabusText ? { syllabusText: schedule.syllabusText } : {}),
      ...(prev?.syllabusText && !course.syllabusText && !schedule?.syllabusText
        ? { syllabusText: prev.syllabusText }
        : {}),
      ...(prev?.syllabusUrl && !course.syllabusUrl && !schedule?.syllabusUrl
        ? { syllabusUrl: prev.syllabusUrl }
        : {}),
    };
  });

  for (const [code, schedule] of Object.entries(snapshot.schedules)) {
    if (!courses.some((c) => c.courseCode === code)) {
      const prev = previousByCode.get(code);
      courses.push({
        courseCode: code,
        courseName: schedule.courseName,
        ...(deptByCode.get(code) ? { department: deptByCode.get(code) } : {}),
        ...(schedule.credits ? { credits: schedule.credits } : {}),
        ...(schedule.description ? { description: schedule.description } : {}),
        ...(schedule.syllabusUrl ? { syllabusUrl: schedule.syllabusUrl } : {}),
        ...(schedule.syllabusText ? { syllabusText: schedule.syllabusText } : {}),
        ...(prev?.syllabusText && !schedule.syllabusText ? { syllabusText: prev.syllabusText } : {}),
      });
    }
  }

  for (const [code, schedule] of Object.entries(snapshot.schedules)) {
    const prev = previousByCode.get(code);
    const course = courses.find((c) => c.courseCode === code);
    if (!schedule.syllabusUrl) {
      schedule.syllabusUrl = course?.syllabusUrl || prev?.syllabusUrl;
    }
    delete schedule.syllabusText;
  }

  courses.sort((a, b) => a.courseCode.localeCompare(b.courseCode, 'en'));

  const seed = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    academicYear: snapshot.latestYear,
    fireflyYear: snapshot.yearLabel,
    totalCourses: courses.length,
    totalSchedules: Object.keys(snapshot.schedules).length,
    departments: previous.departments || [],
    calendar: snapshot.calendar || previous.calendar,
    courses,
    schedules: snapshot.schedules,
  };

  writeFileSync(SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`);
  console.log(
    `Wrote ${courses.length} courses and ${seed.totalSchedules} schedules (${snapshot.detailsCount} detail pages) for ${snapshot.latestYear} (FireFly ${snapshot.yearLabel})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
