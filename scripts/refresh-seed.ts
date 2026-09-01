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

  const snapshot = await scrapeLatestSnapshot(20000);

  const courses: CourseSummary[] = snapshot.courses.map((course) => ({
    ...course,
    ...(deptByCode.get(course.courseCode) && !course.department
      ? { department: deptByCode.get(course.courseCode) }
      : {}),
  }));

  for (const [code, schedule] of Object.entries(snapshot.schedules)) {
    if (!courses.some((c) => c.courseCode === code)) {
      courses.push({
        courseCode: code,
        courseName: schedule.courseName,
        ...(deptByCode.get(code) ? { department: deptByCode.get(code) } : {}),
      });
    }
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
    `Wrote ${courses.length} courses and ${seed.totalSchedules} schedules for ${snapshot.latestYear} (FireFly ${snapshot.yearLabel})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
