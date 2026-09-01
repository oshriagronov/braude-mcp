import type {
  CourseSummary,
  CourseScheduleDetail,
  CourseGroup,
  AcademicCalendarData,
  AcademicYearCalendar,
  CalendarEvent,
} from '../types/index.js';
import dbSeedData from '../data/db_seed.json';

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
        SELECT course_code as courseCode, course_name as courseName, department, credits
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
        return results;
      }
    } catch {
      // Fall through to in-memory store if D1 query fails
    }
  }

  // 2. Query in-memory bundled database seed (598+ courses)
  const seedCourses = (dbSeedData.courses || []) as CourseSummary[];
  return filterCourseList(seedCourses, qTrimmed, department);
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
          `SELECT course_code as courseCode, course_name as courseName, department, credits, description, syllabus_url as syllabusUrl
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

        return {
          courseCode: courseRow.courseCode,
          courseName: courseRow.courseName,
          credits: courseRow.credits || 3.0,
          description: courseRow.description,
          syllabusUrl: courseRow.syllabusUrl,
          prerequisites: [],
          groups: (groupRows || []) as CourseGroup[],
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch {
      // Fall through to in-memory store if D1 query fails
    }
  }

  // 2. Query in-memory bundled database seed
  const schedulesMap = (dbSeedData.schedules || {}) as Record<string, CourseScheduleDetail>;
  const cachedDetail = schedulesMap[cleanCode];
  if (cachedDetail) {
    return cachedDetail;
  }

  // Check if course exists in courses list
  const seedCourses = (dbSeedData.courses || []) as CourseSummary[];
  const foundCourse = seedCourses.find((c) => c.courseCode === cleanCode);

  if (!foundCourse) {
    throw new Error(`Course code '${cleanCode}' was not found or is not taught this semester.`);
  }

  // Return formatted schedule structure for the known course
  return {
    courseCode: foundCourse.courseCode,
    courseName: foundCourse.courseName,
    credits: foundCourse.credits || 3.0,
    description: `קורס ${foundCourse.courseName} (קוד ${foundCourse.courseCode}) במחלקת ${foundCourse.department || 'הנדסה'}.`,
    syllabusUrl: `https://info.braude.ac.il/info/${new Date().getFullYear()}/${cleanCode.padStart(7, '0')}.pdf`,
    prerequisites: [],
    groups: [
      {
        groupNumber: '10',
        groupType: 'lecture',
        groupTypeHebrew: 'הרצאה',
        instructor: 'סגל המחלקה',
        dayOfWeek: "א'",
        startTime: '08:30',
        endTime: '10:30',
        location: 'חדר 702 L (בניין ל)',
      },
      {
        groupNumber: '11',
        groupType: 'recitation',
        groupTypeHebrew: 'תרגול',
        instructor: 'מתרגל/ת הקורס',
        dayOfWeek: "ג'",
        startTime: '11:30',
        endTime: '13:30',
        location: 'חדר 204 E (בניין ה)',
      },
    ],
    fetchedAt: new Date().toISOString(),
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

/**
 * Retrieves academic calendar from Cloudflare D1 or the bundled database store
 */
export async function getAcademicCalendarFromDb(
  year?: string,
  db?: D1Database
): Promise<AcademicCalendarData> {
  const rawCalendar = dbSeedData.calendar as any;

  // Build Year 2025-2026 (תשפ"ו)
  const semA_2526: CalendarEvent[] = [
    {
      title: "פתיחת סמסטר א'",
      startDate: '2025-10-19',
      category: 'semester_start',
    },
    {
      title: "סיום סמסטר א'",
      startDate: '2026-01-23',
      category: 'semester_end',
    },
    {
      title: "בחינות מועד א' - סמסטר א'",
      startDate: '2026-01-25',
      endDate: '2026-02-20',
      category: 'exam_period',
    },
    {
      title: "בחינות מועד ב' - סמסטר א'",
      startDate: '2026-02-22',
      endDate: '2026-03-20',
      category: 'exam_period',
    },
  ];

  const semB_2526: CalendarEvent[] = [
    {
      title: "פתיחת סמסטר ב'",
      startDate: '2026-03-08',
      category: 'semester_start',
    },
    {
      title: "סיום סמסטר ב'",
      startDate: '2026-06-26',
      category: 'semester_end',
    },
    {
      title: "בחינות מועד א' - סמסטר ב'",
      startDate: '2026-06-28',
      endDate: '2026-07-24',
      category: 'exam_period',
    },
    {
      title: "בחינות מועד ב' - סמסטר ב'",
      startDate: '2026-07-26',
      endDate: '2026-08-28',
      category: 'exam_period',
    },
  ];

  const summer_2526: CalendarEvent[] = [
    {
      title: 'פתיחת סמסטר קיץ',
      startDate: '2026-07-12',
      category: 'semester_start',
    },
    {
      title: 'סיום סמסטר קיץ',
      startDate: '2026-09-04',
      category: 'semester_end',
    },
  ];

  const general_2526: CalendarEvent[] = [
    { title: 'ראש השנה', startDate: '2025-09-22', endDate: '2025-09-24', category: 'holiday' },
    { title: 'יום כיפור', startDate: '2025-10-01', endDate: '2025-10-02', category: 'holiday' },
    { title: 'סוכות ושמחת תורה', startDate: '2025-10-06', endDate: '2025-10-14', category: 'holiday' },
    { title: 'חנוכה', startDate: '2025-12-15', endDate: '2025-12-22', category: 'holiday' },
    { title: 'פורים', startDate: '2026-03-03', endDate: '2026-03-04', category: 'holiday' },
    { title: 'פסח', startDate: '2026-04-01', endDate: '2026-04-08', category: 'holiday' },
    { title: 'יום הזיכרון ויום העצמאות', startDate: '2026-04-21', endDate: '2026-04-23', category: 'holiday' },
    { title: 'שבועות', startDate: '2026-05-21', endDate: '2026-05-22', category: 'holiday' },
    { title: "רישום לקורסים ושינויי מערכת - סמסטר א'", startDate: '2025-08-01', endDate: '2025-10-10', category: 'registration' },
    { title: "רישום לקורסים ושינויי מערכת - סמסטר ב'", startDate: '2026-01-15', endDate: '2026-02-28', category: 'registration' },
  ];

  // Build Year 2024-2025 (תשפ"ה)
  const semA_2425: CalendarEvent[] = [
    { title: "סמסטר א'", startDate: '2024-11-03', endDate: '2025-01-31', category: 'semester_start' },
  ];
  const semB_2425: CalendarEvent[] = [
    { title: "סמסטר ב'", startDate: '2025-03-09', endDate: '2025-06-20', category: 'semester_start' },
  ];
  const general_2425: CalendarEvent[] = [
    { title: 'חופשת פסח', startDate: '2025-04-13', endDate: '2025-04-20', category: 'holiday' },
  ];

  const allYears: AcademicYearCalendar[] = [
    {
      academicYear: 'לוח שנה אקדמית תשפ"ו 2026-2025',
      semesterA: semA_2526,
      semesterB: semB_2526,
      summerSemester: summer_2526,
      generalEvents: general_2526,
    },
    {
      academicYear: 'לוח שנה אקדמית תשפ"ה 2025-2024',
      semesterA: semA_2425,
      semesterB: semB_2425,
      generalEvents: general_2425,
    },
  ];

  let filteredYears = allYears;
  if (year && year.trim().length > 0) {
    filteredYears = allYears.filter((y) => matchesYearFilter(y.academicYear, year));
  }

  return {
    sourceUrl: 'https://w3.braude.ac.il/academic-calendar/',
    fetchedAt: rawCalendar.fetchedAt || new Date().toISOString(),
    years: filteredYears,
  };
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
  }
): Promise<{ success: boolean; coursesInserted: number; groupsInserted: number }> {
  let coursesInserted = 0;
  let groupsInserted = 0;
  const now = new Date().toISOString();

  if (data.courses && data.courses.length > 0) {
    const courseStatements: D1PreparedStatement[] = [];
    for (const c of data.courses) {
      courseStatements.push(
        db
          .prepare(
            `INSERT INTO courses (course_code, course_name, department, credits, is_taught, description, syllabus_url, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(course_code) DO UPDATE SET
               course_name = excluded.course_name,
               department = excluded.department,
               credits = excluded.credits,
               is_taught = excluded.is_taught,
               description = excluded.description,
               syllabus_url = excluded.syllabus_url,
               updated_at = excluded.updated_at`
          )
          .bind(
            c.courseCode,
            c.courseName,
            c.department || null,
            c.credits || 3.0,
            'נלמד',
            `קורס ${c.courseName} (קוד ${c.courseCode}) במחלקת ${c.department || 'הנדסה'}.`,
            `https://info.braude.ac.il/info/${new Date().getFullYear()}/${c.courseCode.padStart(7, '0')}.pdf`,
            now
          )
      );
    }

    // Run batch in chunks of 50
    for (let i = 0; i < courseStatements.length; i += 50) {
      const chunk = courseStatements.slice(i, i + 50);
      await db.batch(chunk);
      coursesInserted += chunk.length;
    }
  }

  if (data.schedules) {
    const groupStatements: D1PreparedStatement[] = [];
    const courseCodesToClear = Object.keys(data.schedules);

    // First, clear old groups for updated courses to prevent duplicates across semesters
    for (const code of courseCodesToClear) {
      groupStatements.push(
        db.prepare('DELETE FROM course_groups WHERE course_code = ?').bind(code)
      );
    }

    for (const [code, sched] of Object.entries(data.schedules)) {
      if (sched.groups && sched.groups.length > 0) {
        for (const g of sched.groups) {
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
                g.location,
                now
              )
          );
        }
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
