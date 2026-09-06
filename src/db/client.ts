import type {
  CourseSummary,
  CourseScheduleDetail,
  CourseSyllabusDetail,
  CourseGroup,
  AcademicCalendarData,
  CalendarEvent,
} from '../types/index.js';
import { attachSyllabusContent } from '../scrapers/syllabus_content.js';
import dbSeedData from '../data/db_seed.json';

const PLACEHOLDER_INSTRUCTORS = new Set(['סגל המחלקה', 'מתרגל/ת הקורס', 'אחראי/ת מעבדה']);

export function isPlaceholderSchedule(groups: CourseGroup[] | undefined): boolean {
  if (!groups || groups.length === 0) {
    return false;
  }
  return groups.every((g) => PLACEHOLDER_INSTRUCTORS.has((g.instructor || '').trim()));
}

function seedCourses(): CourseSummary[] {
  return (dbSeedData.courses || []) as CourseSummary[];
}

function seedSchedules(): Record<string, CourseScheduleDetail> {
  return (dbSeedData.schedules || {}) as Record<string, CourseScheduleDetail>;
}

function overlaySeedMetadata<
  T extends {
    courseCode?: string;
    department?: string;
    credits?: number;
    description?: string;
    syllabusUrl?: string;
    syllabusText?: string;
    prerequisites?: string[];
  },
>(row: T): T {
  const code = row.courseCode;
  if (!code) return row;
  const seedCourse = seedCourses().find((c) => c.courseCode === code);
  const seedSchedule = seedSchedules()[code];
  return {
    ...row,
    department: row.department || seedCourse?.department,
    credits: row.credits || seedCourse?.credits || seedSchedule?.credits || row.credits,
    description: row.description || seedCourse?.description || seedSchedule?.description,
    syllabusUrl: row.syllabusUrl || seedCourse?.syllabusUrl || seedSchedule?.syllabusUrl,
    syllabusText: row.syllabusText || seedCourse?.syllabusText || seedSchedule?.syllabusText,
    prerequisites:
      row.prerequisites && row.prerequisites.length > 0
        ? row.prerequisites
        : seedCourse?.prerequisites || seedSchedule?.prerequisites || row.prerequisites,
  };
}

function withoutSyllabusText(course: CourseSummary): CourseSummary {
  const copy: CourseSummary = { ...course };
  delete copy.syllabusText;
  return copy;
}

export interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement;
  all<T = any>(): Promise<{ results: T[]; success: boolean }>;
  first<T = any>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: any }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = any>(statements: D1PreparedStatement[]): Promise<{ results: T[]; success: boolean }[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

/**
 * Normalizes Hebrew text for resilient fuzzy & multi-token matching
 */
export function normalizeHebrewText(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'״׳]/g, '')
    .replace(/[\u0591-\u05C7]/g, '') // remove Hebrew niqqud
    .trim();
}

/**
 * Filters in-memory course list against a query and optional department
 */
export function filterCourseList(
  courses: CourseSummary[],
  query: string,
  department?: string
): CourseSummary[] {
  const qClean = query.trim().toLowerCase();
  const qNorm = normalizeHebrewText(qClean);
  const qTokens = qNorm.split(/\s+/).filter((t) => t.length > 0);
  const deptClean = department ? department.trim().toLowerCase() : undefined;
  const deptNorm = deptClean ? normalizeHebrewText(deptClean) : undefined;

  return courses.filter((course) => {
    const cCode = (course.courseCode || '').toLowerCase();
    const cName = (course.courseName || '').toLowerCase();
    const cNameNorm = normalizeHebrewText(cName);
    const cDept = (course.department || '').toLowerCase();
    const cDeptNorm = normalizeHebrewText(cDept);

    const codeMatch = cCode.includes(qClean) || qClean.includes(cCode);
    const nameMatch = cName.includes(qClean) || cNameNorm.includes(qNorm);
    const deptMatch = cDept.includes(qClean) || cDeptNorm.includes(qNorm);

    // Multi-token match (e.g. "מבוא מחשב", "אלגברה לינ")
    const allTokensMatch =
      qTokens.length > 0 &&
      qTokens.every(
        (tok) =>
          cNameNorm.includes(tok) ||
          cCode.includes(tok) ||
          cDeptNorm.includes(tok)
      );

    const matchesQuery = codeMatch || nameMatch || deptMatch || allTokensMatch;
    const matchesDept = deptClean
      ? cDept.includes(deptClean) || cDeptNorm.includes(deptNorm || '')
      : true;

    return matchesQuery && matchesDept;
  });
}

/**
 * Searches courses in Cloudflare D1 (if available) or the in-memory database store
 */
export async function searchCoursesInDb(
  query: string,
  department?: string,
  db?: D1Database
): Promise<CourseSummary[]> {
  const qTrimmed = query.trim();

  // 1. If D1 database instance is provided, attempt SQL query
  if (db) {
    try {
      let sql = `
        SELECT course_code as courseCode, course_name as courseName, department, credits,
               description, syllabus_url as syllabusUrl
        FROM courses
        WHERE (course_code LIKE ? OR course_name LIKE ? OR department LIKE ?)
      `;
      const params: any[] = [`%${qTrimmed}%`, `%${qTrimmed}%`, `%${qTrimmed}%`];

      if (department && department.trim()) {
        sql += ` AND department LIKE ?`;
        params.push(`%${department.trim()}%`);
      }

      sql += ` ORDER BY course_code ASC LIMIT 100`;

      const stmt = db.prepare(sql).bind(...params);
      const { results } = await stmt.all<CourseSummary>();

      if (results && results.length > 0) {
        return results.map((row) => withoutSyllabusText(overlaySeedMetadata(row)));
      }
    } catch {
      // Fall through to in-memory store if D1 query fails
    }
  }

  // 2. Query in-memory bundled database seed (598+ courses)
  const seedCourses = (dbSeedData.courses || []) as CourseSummary[];
  return filterCourseList(seedCourses, qTrimmed, department).map(withoutSyllabusText);
}

/**
 * Retrieves detailed course schedule and groups from Cloudflare D1 or the bundled database store
 */
export async function getCourseScheduleFromDb(
  courseCode: string,
  db?: D1Database
): Promise<CourseScheduleDetail> {
  const cleanCode = courseCode.trim();

  // 1. If D1 database instance is provided, attempt SQL retrieval
  if (db) {
    try {
      const courseRow = await db
        .prepare(
          `SELECT course_code as courseCode, course_name as courseName, department, credits, description,
                  syllabus_url as syllabusUrl, syllabus_text as syllabusText, prerequisites
           FROM courses WHERE course_code = ?`
        )
        .bind(cleanCode)
        .first<any>();

      if (courseRow) {
        const { results: groupRows } = await db
          .prepare(
            `SELECT group_number as groupNumber, group_type as groupType, group_type_hebrew as groupTypeHebrew,
                    instructor, day_of_week as dayOfWeek, start_time as startTime, end_time as endTime, location
             FROM course_groups WHERE course_code = ? ORDER BY group_number ASC`
          )
          .bind(cleanCode)
          .all<CourseGroup>();

        let prerequisites: string[] = [];
        if (typeof courseRow.prerequisites === 'string' && courseRow.prerequisites.trim()) {
          try {
            const parsed = JSON.parse(courseRow.prerequisites);
            if (Array.isArray(parsed)) {
              prerequisites = parsed.filter((p: unknown) => typeof p === 'string');
            }
          } catch {
            prerequisites = [];
          }
        }

        return attachSyllabusContent(
          overlaySeedMetadata({
            courseCode: courseRow.courseCode,
            courseName: courseRow.courseName,
            department: courseRow.department || undefined,
            credits: typeof courseRow.credits === 'number' ? courseRow.credits : 0,
            description: courseRow.description || undefined,
            syllabusUrl: courseRow.syllabusUrl || undefined,
            syllabusText: courseRow.syllabusText || undefined,
            prerequisites,
            groups: isPlaceholderSchedule(groupRows as CourseGroup[])
              ? []
              : ((groupRows || []) as CourseGroup[]),
            fetchedAt: new Date().toISOString(),
          })
        );
      }
    } catch {
      // Fall through to in-memory store if D1 query fails
    }
  }

  // 2. Query in-memory bundled database seed — real scraped schedules only
  const schedulesMap = (dbSeedData.schedules || {}) as Record<string, CourseScheduleDetail>;
  const cachedDetail = schedulesMap[cleanCode];
  if (cachedDetail && !isPlaceholderSchedule(cachedDetail.groups)) {
    return attachSyllabusContent(overlaySeedMetadata({ ...cachedDetail }));
  }

  const seedCourses = (dbSeedData.courses || []) as CourseSummary[];
  const foundCourse = seedCourses.find((c) => c.courseCode === cleanCode);

  if (!foundCourse) {
    throw new Error(`Course code '${cleanCode}' was not found or is not taught this semester.`);
  }

  return attachSyllabusContent(
    overlaySeedMetadata({
      courseCode: foundCourse.courseCode,
      courseName: foundCourse.courseName,
      department: foundCourse.department,
      credits: foundCourse.credits || 0,
      ...(foundCourse.description ? { description: foundCourse.description } : {}),
      ...(foundCourse.syllabusUrl ? { syllabusUrl: foundCourse.syllabusUrl } : {}),
      ...(foundCourse.syllabusText ? { syllabusText: foundCourse.syllabusText } : {}),
      ...(foundCourse.prerequisites && foundCourse.prerequisites.length > 0
        ? { prerequisites: foundCourse.prerequisites }
        : {}),
      groups: [],
      fetchedAt: new Date().toISOString(),
    })
  );
}

/**
 * Returns comprehensive course info from D1/seed: schedule from the site plus
 * ingested syllabus PDF (attendance, grading, topics, exam). Never fetches live.
 */
export async function getCourseSyllabusFromDb(
  courseCode: string,
  db?: D1Database
): Promise<CourseSyllabusDetail> {
  const schedule = await getCourseScheduleFromDb(courseCode, db);
  return {
    courseCode: schedule.courseCode,
    courseName: schedule.courseName,
    ...(schedule.department ? { department: schedule.department } : {}),
    credits: schedule.credits,
    ...(schedule.description ? { description: schedule.description } : {}),
    ...(schedule.syllabusUrl ? { syllabusUrl: schedule.syllabusUrl } : {}),
    ...(schedule.syllabusText ? { syllabusText: schedule.syllabusText } : {}),
    ...(schedule.syllabus ? { syllabus: schedule.syllabus } : {}),
    ...(schedule.prerequisites && schedule.prerequisites.length > 0
      ? { prerequisites: schedule.prerequisites }
      : {}),
    ...(schedule.groups && schedule.groups.length > 0 ? { groups: schedule.groups } : {}),
    fetchedAt: schedule.fetchedAt,
  };
}

/**
 * Checks whether an academic year string matches the search filter
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

export function isScrapedCalendar(data: unknown): data is AcademicCalendarData {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const calendar = data as AcademicCalendarData;
  return (
    typeof calendar.sourceUrl === 'string' &&
    calendar.sourceUrl.includes('braude.ac.il') &&
    typeof calendar.fetchedAt === 'string' &&
    Array.isArray(calendar.years) &&
    calendar.years.length > 0
  );
}

function filterScrapedCalendar(data: AcademicCalendarData, year?: string): AcademicCalendarData {
  if (!year || year.trim().length === 0) {
    return data;
  }
  return {
    ...data,
    years: data.years.filter((y) => matchesYearFilter(y.academicYear, year)),
  };
}

function seedCalendar(): AcademicCalendarData | undefined {
  const raw = (dbSeedData as { calendar?: unknown }).calendar;
  return isScrapedCalendar(raw) ? raw : undefined;
}

async function ensureCalendarTables(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS calendar_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`
  );
  try {
    await db.prepare('ALTER TABLE academic_calendar ADD COLUMN semester_group TEXT').run();
  } catch {
    // Column already exists
  }
  try {
    await db.prepare('ALTER TABLE academic_calendar ADD COLUMN raw_date_str TEXT').run();
  } catch {
    // Column already exists
  }
}

function flattenCalendarEvents(
  calendar: AcademicCalendarData
): Array<{
  academicYear: string;
  event: CalendarEvent;
  semesterGroup: string;
}> {
  const rows: Array<{ academicYear: string; event: CalendarEvent; semesterGroup: string }> = [];
  for (const year of calendar.years) {
    for (const event of year.semesterA || []) {
      rows.push({ academicYear: year.academicYear, event, semesterGroup: 'A' });
    }
    for (const event of year.semesterB || []) {
      rows.push({ academicYear: year.academicYear, event, semesterGroup: 'B' });
    }
    for (const event of year.summerSemester || []) {
      rows.push({ academicYear: year.academicYear, event, semesterGroup: 'summer' });
    }
    for (const event of year.generalEvents || []) {
      rows.push({ academicYear: year.academicYear, event, semesterGroup: 'general' });
    }
  }
  return rows;
}

/**
 * Writes a freshly scraped calendar into D1. Call only when scrape succeeded.
 * Does not run on scrape failure, so the previous snapshot stays.
 */
export async function persistAcademicCalendar(
  db: D1Database,
  calendar: AcademicCalendarData
): Promise<void> {
  if (!isScrapedCalendar(calendar)) {
    return;
  }
  await ensureCalendarTables(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO calendar_snapshot (id, source_url, fetched_at, payload, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_url = excluded.source_url,
         fetched_at = excluded.fetched_at,
         payload = excluded.payload,
         updated_at = excluded.updated_at`
    )
    .bind(calendar.sourceUrl, calendar.fetchedAt, JSON.stringify(calendar), now)
    .run();

  await db.prepare('DELETE FROM academic_calendar').run();
  const eventRows = flattenCalendarEvents(calendar);
  const statements: D1PreparedStatement[] = [];
  for (const row of eventRows) {
    statements.push(
      db
        .prepare(
          `INSERT INTO academic_calendar
             (academic_year, event_name, event_category, start_date, end_date, description, semester_group, raw_date_str, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.academicYear,
          row.event.title,
          row.event.category,
          row.event.startDate || '',
          row.event.endDate || null,
          row.event.rawDateStr || null,
          row.semesterGroup,
          row.event.rawDateStr || null,
          now
        )
    );
  }
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

async function loadCalendarSnapshotFromDb(db: D1Database): Promise<AcademicCalendarData | undefined> {
  try {
    await ensureCalendarTables(db);
    const row = await db
      .prepare('SELECT payload FROM calendar_snapshot WHERE id = 1')
      .first<{ payload: string }>();
    if (!row?.payload) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(row.payload);
    return isScrapedCalendar(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Retrieves scraped academic calendar from D1, then the bundled scrape seed.
 * Never returns hardcoded dates. Throws if no scraped calendar is stored.
 */
export async function getAcademicCalendarFromDb(
  year?: string,
  db?: D1Database
): Promise<AcademicCalendarData> {
  if (db) {
    const stored = await loadCalendarSnapshotFromDb(db);
    if (stored) {
      return filterScrapedCalendar(stored, year);
    }
  }

  const seed = seedCalendar();
  if (seed) {
    return filterScrapedCalendar(seed, year);
  }

  throw new Error('Academic calendar is unavailable: no scraped calendar is stored.');
}

export interface StoredSyllabus {
  syllabusUrl?: string;
  syllabusText?: string;
}

/**
 * Loads already-ingested syllabus PDF text from D1 so a catalog replace
 * does not wipe PDFs, and the 3-day scrape can skip/refresh from a known base.
 */
export async function loadCourseSyllabiFromDb(db: D1Database): Promise<Map<string, StoredSyllabus>> {
  const stored = new Map<string, StoredSyllabus>();
  try {
    const { results } = await db
      .prepare(
        `SELECT course_code as courseCode, syllabus_url as syllabusUrl, syllabus_text as syllabusText
         FROM courses
         WHERE syllabus_text IS NOT NULL AND TRIM(syllabus_text) != ''`
      )
      .all<{ courseCode: string; syllabusUrl?: string; syllabusText?: string }>();
    for (const row of results || []) {
      if (!row.courseCode) continue;
      stored.set(row.courseCode, {
        ...(row.syllabusUrl ? { syllabusUrl: row.syllabusUrl } : {}),
        ...(row.syllabusText ? { syllabusText: row.syllabusText } : {}),
      });
    }
  } catch {
    // Column may not exist yet on a fresh D1
  }
  return stored;
}

/**
 * Copies D1 (and seed fallback) syllabus text onto freshly scraped catalog rows
 * so replaceAll persists PDFs even if this run cannot re-fetch every file.
 */
export function applyStoredSyllabi(
  courses: CourseSummary[],
  schedules: Record<string, CourseScheduleDetail>,
  stored: Map<string, StoredSyllabus>
): void {
  for (const course of courses) {
    const hit = stored.get(course.courseCode);
    const seeded = overlaySeedMetadata({ ...course });
    if (!course.syllabusText) {
      course.syllabusText = hit?.syllabusText || seeded.syllabusText;
    }
    if (!course.syllabusUrl) {
      course.syllabusUrl = hit?.syllabusUrl || seeded.syllabusUrl;
    }
  }
  for (const [code, schedule] of Object.entries(schedules)) {
    const course = courses.find((c) => c.courseCode === code);
    const hit = stored.get(code);
    if (!schedule.syllabusText) {
      schedule.syllabusText = course?.syllabusText || hit?.syllabusText;
    }
    if (!schedule.syllabusUrl) {
      schedule.syllabusUrl = course?.syllabusUrl || hit?.syllabusUrl;
    }
  }
}

/**
 * Updates syllabus PDF columns only — used for incremental persist during the 3-day scrape.
 */
export async function upsertCourseSyllabi(db: D1Database, courses: CourseSummary[]): Promise<number> {
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const course of courses) {
    if (!course.syllabusText && !course.syllabusUrl) {
      continue;
    }
    statements.push(
      db
        .prepare(
          `UPDATE courses
           SET syllabus_url = COALESCE(?, syllabus_url),
               syllabus_text = COALESCE(?, syllabus_text),
               updated_at = ?
           WHERE course_code = ?`
        )
        .bind(course.syllabusUrl || null, course.syllabusText || null, now, course.courseCode)
    );
  }
  let updated = 0;
  for (let i = 0; i < statements.length; i += 50) {
    const chunk = statements.slice(i, i + 50);
    await db.batch(chunk);
    updated += chunk.length;
  }
  return updated;
}

/**
 * Upserts course and calendar data into Cloudflare D1 during background sync
 */
export async function syncDatabaseFromScrape(
  db: D1Database,
  data: {
    courses?: CourseSummary[];
    calendar?: any;
    schedules?: Record<string, CourseScheduleDetail>;
    replaceAll?: boolean;
  }
): Promise<{ success: boolean; coursesInserted: number; groupsInserted: number }> {
  let coursesInserted = 0;
  let groupsInserted = 0;
  const now = new Date().toISOString();

  if (data.replaceAll) {
    await db.prepare('DELETE FROM course_groups').run();
    if (data.courses && data.courses.length > 0) {
      await db.prepare('DELETE FROM courses').run();
    }
  }

  try {
    await db.prepare('ALTER TABLE courses ADD COLUMN prerequisites TEXT').run();
  } catch {
    // Column already exists
  }

  try {
    await db.prepare('ALTER TABLE courses ADD COLUMN syllabus_text TEXT').run();
  } catch {
    // Column already exists
  }

  if (data.courses && data.courses.length > 0) {
    const schedules = data.schedules || {};
    const courseStatements: D1PreparedStatement[] = [];
    for (const c of data.courses) {
      const schedule = schedules[c.courseCode];
      const description = c.description || schedule?.description || null;
      const syllabusUrl = c.syllabusUrl || schedule?.syllabusUrl || null;
      const syllabusText = c.syllabusText || schedule?.syllabusText || null;
      const credits = c.credits ?? schedule?.credits ?? null;
      const prerequisites = c.prerequisites || schedule?.prerequisites || [];
      courseStatements.push(
        db
          .prepare(
            `INSERT INTO courses (course_code, course_name, department, credits, is_taught, description, syllabus_url, syllabus_text, prerequisites, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(course_code) DO UPDATE SET
               course_name = excluded.course_name,
               department = excluded.department,
               credits = excluded.credits,
               is_taught = excluded.is_taught,
               description = excluded.description,
               syllabus_url = COALESCE(excluded.syllabus_url, courses.syllabus_url),
               syllabus_text = COALESCE(excluded.syllabus_text, courses.syllabus_text),
               prerequisites = excluded.prerequisites,
               updated_at = excluded.updated_at`
          )
          .bind(
            c.courseCode,
            c.courseName,
            c.department || null,
            credits,
            'נלמד',
            description,
            syllabusUrl,
            syllabusText,
            prerequisites.length > 0 ? JSON.stringify(prerequisites) : null,
            now
          )
      );
    }

    for (let i = 0; i < courseStatements.length; i += 50) {
      const chunk = courseStatements.slice(i, i + 50);
      await db.batch(chunk);
      coursesInserted += chunk.length;
    }
  }

  if (data.schedules && Object.keys(data.schedules).length > 0) {
    const groupStatements: D1PreparedStatement[] = [];
    const courseCodesToClear = Object.keys(data.schedules);

    if (!data.replaceAll) {
      for (const code of courseCodesToClear) {
        groupStatements.push(
          db.prepare('DELETE FROM course_groups WHERE course_code = ?').bind(code)
        );
      }
    }

    for (const [code, sched] of Object.entries(data.schedules)) {
      if (!sched.groups || sched.groups.length === 0 || isPlaceholderSchedule(sched.groups)) {
        continue;
      }
      for (const g of sched.groups) {
        if (isPlaceholderSchedule([g]) || !g.dayOfWeek || !g.startTime || !g.endTime) {
          continue;
        }
        groupStatements.push(
          db
            .prepare(
              `INSERT INTO course_groups (course_code, group_number, group_type, group_type_hebrew, instructor, day_of_week, start_time, end_time, location, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              code,
              g.groupNumber,
              g.groupType,
              g.groupTypeHebrew,
              g.instructor,
              g.dayOfWeek,
              g.startTime,
              g.endTime,
              g.location || '',
              now
            )
        );
      }
    }

    if (groupStatements.length > 0) {
      for (let i = 0; i < groupStatements.length; i += 50) {
        const chunk = groupStatements.slice(i, i + 50);
        await db.batch(chunk);
        groupsInserted += chunk.length;
      }
    }
  }

  return { success: true, coursesInserted, groupsInserted };
}
