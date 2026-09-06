import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  cleanSyllabusText,
  extractPdfText,
  fetchSyllabusPdfText,
  ingestSyllabusPdfs,
  MAX_SYLLABUS_CHARS,
} from '../../src/scrapers/syllabus_pdf.js';
import {
  normalizeSyllabusText,
  parseSyllabusContent,
} from '../../src/scrapers/syllabus_content.js';
import type { CourseScheduleDetail, CourseSummary } from '../../src/types/index.js';

function makePlainTextPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function pdfResponse(bytes: Uint8Array): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  });
}

describe('Syllabus PDF ingest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('cleanSyllabusText', () => {
    it('strips bidi marks and collapses extra whitespace', () => {
      const raw = '\u202Bנושאי הלימוד:\u202C\n\n\nExam: 70%\t\tfinal';
      expect(cleanSyllabusText(raw)).toBe('נושאי הלימוד:\n\nExam: 70% final');
    });
  });

  describe('extractPdfText', () => {
    it('extracts topics and exam text from a PDF', async () => {
      const bytes = makePlainTextPdf('Topics: cryptography. Exam: 70% final exam, 30% homework.');
      const text = await extractPdfText(bytes);
      expect(text).toContain('cryptography');
      expect(text).toMatch(/Exam: 70% final exam/);
    });

    it('keeps a cap large enough for a full multi-page syllabus PDF', () => {
      expect(MAX_SYLLABUS_CHARS).toBeGreaterThanOrEqual(100_000);
    });
  });

  describe('parseSyllabusContent', () => {
    it('extracts mandatory lecture attendance from glued Hebrew PDF text', () => {
      const raw = `דרישות הקורס והרכב הציון:
•נוכחות:
חובתנוכחות100%בהרצאות(הן של המרצה והן של הסטודנטים).
אינה חובה במפגשי ההדרכה.
•ציון:
80%-ינתנו על איכותההרצאה המועברת`;
      const parsed = parseSyllabusContent(raw);
      expect(parsed.attendance).toBeTruthy();
      expect(parsed.attendance).toMatch(/חובת נוכחות/);
      expect(parsed.attendance).toMatch(/100%/);
      expect(parsed.attendance).toMatch(/הרצאות/);
      expect(parsed.grading || parsed.attendance).toBeTruthy();
    });

    it('extracts lab attendance that is required to sit the exam', () => {
      const raw = `קביעת הציון:
נוכחותחובהבלפחות10מעבדות(למעט מקרים חריגים).
סטודנט שאינו עומד בתנאי הנוכחות במעבדה לא יורשה לגשת למבחן.`;
      const parsed = parseSyllabusContent(raw);
      expect(parsed.attendance).toMatch(/נוכחות חובה/);
      expect(parsed.attendance).toMatch(/מעבדות/);
    });

    it('spaces Hebrew letters apart from percents and digits', () => {
      expect(normalizeSyllabusText('חובתנוכחות100%בהרצאות')).toContain('חובת נוכחות');
      expect(normalizeSyllabusText('חובתנוכחות100%בהרצאות')).toContain('100%');
    });
  });

  describe('fetchSyllabusPdfText', () => {
    it('returns extracted text for a valid PDF response', async () => {
      const bytes = makePlainTextPdf('Course subjects: KMP, suffix trees. Grading: seminar presentation.');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => pdfResponse(bytes))
      );

      const text = await fetchSyllabusPdfText('https://info.braude.ac.il/info/2027/0062005.pdf');
      expect(text).toContain('suffix trees');
      expect(text).toContain('seminar presentation');
    });

    it('returns undefined for HTTP errors and non-PDF bodies', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('not found', { status: 404 }))
      );
      expect(await fetchSyllabusPdfText('https://info.braude.ac.il/info/2027/0000000.pdf')).toBeUndefined();

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('<html>not a pdf</html>', { status: 200 }))
      );
      expect(await fetchSyllabusPdfText('https://info.braude.ac.il/info/2027/0062005.pdf')).toBeUndefined();
    });
  });

  describe('ingestSyllabusPdfs', () => {
    it('stores extracted PDF text on course and schedule records', async () => {
      const bytes = makePlainTextPdf(
        'Topics: KMP algorithm and suffix trees. Grading: 80% lecture, 20% mentoring.'
      );
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => pdfResponse(bytes))
      );

      const courses: CourseSummary[] = [
        { courseCode: '62005', courseName: 'סמינר בהתאמת תבניות' },
      ];
      const schedules: Record<string, CourseScheduleDetail> = {
        '62005': {
          courseCode: '62005',
          courseName: 'סמינר בהתאמת תבניות',
          credits: 3,
          groups: [],
          fetchedAt: new Date().toISOString(),
        },
      };

      const { pdfsIngested } = await ingestSyllabusPdfs(courses, schedules, '2027', {
        timeoutMs: 2000,
      });
      expect(pdfsIngested).toBe(1);
      expect(courses[0].syllabusText).toContain('KMP algorithm');
      expect(courses[0].syllabusText).toContain('Grading');
      expect(schedules['62005'].syllabusText).toBe(courses[0].syllabusText);
      expect(courses[0].syllabusUrl).toBe('https://info.braude.ac.il/info/2027/0062005.pdf');
    });

    it('skips courses that already have syllabusText', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const courses: CourseSummary[] = [
        {
          courseCode: '62005',
          courseName: 'סמינר בהתאמת תבניות',
          syllabusText: 'already ingested topics and exam',
        },
      ];
      const { pdfsIngested } = await ingestSyllabusPdfs(courses, {}, '2027', { timeoutMs: 2000 });
      expect(pdfsIngested).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('re-fetches existing syllabus text when refreshExisting is set (3-day refresh)', async () => {
      const bytes = makePlainTextPdf(
        'Updated topics: suffix arrays. Exam: 100% seminar presentation required.'
      );
      const fetchSpy = vi.fn(async () => pdfResponse(bytes));
      vi.stubGlobal('fetch', fetchSpy);

      const courses: CourseSummary[] = [
        {
          courseCode: '62005',
          courseName: 'סמינר בהתאמת תבניות',
          syllabusText: 'stale ingested text',
        },
      ];
      const { pdfsIngested } = await ingestSyllabusPdfs(courses, {}, '2027', {
        timeoutMs: 2000,
        refreshExisting: true,
      });
      expect(pdfsIngested).toBe(1);
      expect(fetchSpy).toHaveBeenCalled();
      expect(courses[0].syllabusText).toContain('suffix arrays');
      expect(courses[0].syllabusText).toContain('seminar presentation');
    });
  });
});
