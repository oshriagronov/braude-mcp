import type { CourseScheduleDetail, CourseSummary } from '../types/index.js';
import { FIREFLY_USER_AGENT } from './firefly.js';
import { normalizeSyllabusText } from './syllabus_content.js';

function defaultSyllabusPdfUrl(courseCode: string, fireflyYear: string): string {
  return `https://info.braude.ac.il/info/${fireflyYear}/${courseCode.padStart(7, '0')}.pdf`;
}

export const MAX_PDF_BYTES = 8_000_000;
/** Sanity cap only — large enough to keep a full multi-page Braude syllabus. */
export const MAX_SYLLABUS_CHARS = 250_000;
const MIN_SYLLABUS_CHARS = 40;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export interface IngestSyllabusOptions {
  timeoutMs?: number;
  /** Re-fetch PDFs that already have text (3-day refresh). Default false (resumable fill). */
  refreshExisting?: boolean;
  maxPdfs?: number;
  onProgress?: (info: {
    processed: number;
    pdfsIngested: number;
    total: number;
  }) => void | Promise<void>;
}

/**
 * Strips bidi marks and collapses noisy whitespace from extracted PDF text.
 */
export function cleanSyllabusText(text: string): string {
  return normalizeSyllabusText(text);
}

function isPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function rotateCodes(codes: string[], nowMs: number = Date.now()): string[] {
  if (codes.length === 0) {
    return codes;
  }
  const offset = Math.floor(nowMs / THREE_DAYS_MS) % codes.length;
  return [...codes.slice(offset), ...codes.slice(0, offset)];
}

/**
 * Extracts the full plain text from a syllabus PDF using the Workers-safe unpdf/PDF.js build.
 */
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.filter((page) => page && page.trim()).join('\n\n') : text;
  const cleaned = normalizeSyllabusText(joined || '');
  if (cleaned.length > MAX_SYLLABUS_CHARS) {
    return cleaned.slice(0, MAX_SYLLABUS_CHARS);
  }
  return cleaned;
}

/**
 * Fetches a public Braude syllabus PDF and returns extracted text, or undefined on failure.
 * Never invents content: missing/non-PDF/empty responses yield undefined.
 */
export async function fetchSyllabusPdfText(
  url: string,
  timeoutMs: number = 12000
): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': FIREFLY_USER_AGENT,
        Accept: 'application/pdf',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return undefined;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 8 || bytes.byteLength > MAX_PDF_BYTES || !isPdfMagic(bytes)) {
      return undefined;
    }
    const text = await extractPdfText(bytes);
    return text.length >= MIN_SYLLABUS_CHARS ? text : undefined;
  } catch {
    return undefined;
  }
}

function copySyllabusAcross(
  course: CourseSummary | undefined,
  schedule: CourseScheduleDetail | undefined
): void {
  const text = course?.syllabusText || schedule?.syllabusText;
  const url = course?.syllabusUrl || schedule?.syllabusUrl;
  if (course) {
    if (text && !course.syllabusText) course.syllabusText = text;
    if (url && !course.syllabusUrl) course.syllabusUrl = url;
  }
  if (schedule) {
    if (text && !schedule.syllabusText) schedule.syllabusText = text;
    if (url && !schedule.syllabusUrl) schedule.syllabusUrl = url;
  }
}

/**
 * Downloads each course's public syllabus PDF and stores the full extracted text
 * on catalog and timetable records.
 */
export async function ingestSyllabusPdfs(
  courses: CourseSummary[],
  schedules: Record<string, CourseScheduleDetail>,
  fireflyYear: string,
  options: IngestSyllabusOptions = {}
): Promise<{ pdfsIngested: number; processed: number }> {
  const timeoutMs = options.timeoutMs ?? 12000;
  const refreshExisting = options.refreshExisting === true;
  const maxPdfs = options.maxPdfs;
  const courseByCode = new Map(courses.map((c) => [c.courseCode, c]));
  const allCodes = Array.from(new Set<string>([...courseByCode.keys(), ...Object.keys(schedules)]));
  const codes = refreshExisting ? rotateCodes(allCodes) : allCodes;

  let pdfsIngested = 0;
  let processed = 0;

  for (const code of codes) {
    if (maxPdfs !== undefined && processed >= maxPdfs) {
      break;
    }
    const course = courseByCode.get(code);
    const schedule = schedules[code];
    copySyllabusAcross(course, schedule);
    if (!refreshExisting && (course?.syllabusText || schedule?.syllabusText)) {
      continue;
    }

    const url = course?.syllabusUrl || schedule?.syllabusUrl || defaultSyllabusPdfUrl(code, fireflyYear);
    const text = await fetchSyllabusPdfText(url, timeoutMs);
    processed += 1;
    if (text) {
      if (course) {
        course.syllabusUrl = course.syllabusUrl || url;
        course.syllabusText = text;
      }
      if (schedule) {
        schedule.syllabusUrl = schedule.syllabusUrl || url;
        schedule.syllabusText = text;
      }
      pdfsIngested += 1;
    }

    if (processed % 50 === 0) {
      console.log(`[SYNC] Ingested syllabus PDFs ${processed}/${codes.length} (${pdfsIngested} with text)`);
      await options.onProgress?.({ processed, pdfsIngested, total: codes.length });
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  if (processed > 0) {
    await options.onProgress?.({ processed, pdfsIngested, total: codes.length });
  }

  return { pdfsIngested, processed };
}
