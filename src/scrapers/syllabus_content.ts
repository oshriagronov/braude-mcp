import type { SyllabusContent } from '../types/index.js';

const COMPACT_PHRASES: Array<[string, string]> = [
  ['חובתנוכחות', 'חובת נוכחות'],
  ['נוכחותחובה', 'נוכחות חובה'],
  ['נוכחותבהרצאות', 'נוכחות בהרצאות'],
  ['קביעתהציון', 'קביעת הציון'],
  ['הרכהציון', 'הרכב הציון'],
  ['נושאיהלימוד', 'נושאי הלימוד'],
  ['נושאיהקורס', 'נושאי הקורס'],
  ['מטרותהקורס', 'מטרות הקורס'],
  ['מטרתהקורס', 'מטרת הקורס'],
  ['דרישותקדם', 'דרישות קדם'],
  ['תוצרילמידה', 'תוצרי למידה'],
  ['דרישותהקורס', 'דרישות הקורס'],
  ['שםהקורס', 'שם הקורס'],
  ['היקףהקורס', 'היקף הקורס'],
  ['משךהקורס', 'משך הקורס'],
  ['שםהמרצה', 'שם המרצה'],
  ['מדיניותשימושב', 'מדיניות שימוש ב'],
  ['שנהוסמסטר', 'שנה וסמסטר'],
  ['תיאורמהלךהקורס', 'תיאור מהלך הקורס'],
];

const SECTION_HEADINGS: Array<{ key: keyof SyllabusContent; match: RegExp }> = [
  { key: 'attendance', match: /^(?:נוכחות|חובת נוכחות|attendance)/i },
  {
    key: 'grading',
    match:
      /^(?:דרישות הקורס והרכב הציון|הרכב הציון|קביעת הציון|בחינות ומדיניות(?: הציונים)?|ציון|grading|course grade)/i,
  },
  { key: 'exam', match: /^(?:בחינה סופית|מבחן סופי|exam)/i },
  { key: 'topics', match: /^(?:נושאי הלימוד|נושאי הקורס|topics|course outline)/i },
  { key: 'objectives', match: /^(?:מטרות הקורס|מטרת הקורס|objectives|course aims)/i },
  { key: 'learningOutcomes', match: /^(?:תוצרי למידה|learning outcomes)/i },
  { key: 'requirements', match: /^(?:דרישות הקורס|תיאור מהלך הקורס|course requirements)/i },
  { key: 'teachingMethods', match: /^(?:שיטות לימוד|מתכונת הרצאות|teaching methods)/i },
  { key: 'bibliography', match: /^(?:ספרות|bibliography)/i },
  { key: 'aiPolicy', match: /^(?:מדיניות שימוש|AI Tool Usage|AI policy)/i },
];

function headingKey(line: string): keyof SyllabusContent | undefined {
  const trimmed = line.replace(/^[•\-*]\s*/, '').replace(/:+\s*$/, '').trim();
  if (trimmed.length > 60) return undefined;
  for (const heading of SECTION_HEADINGS) {
    const match = trimmed.match(heading.match);
    if (!match) continue;
    const leftover = trimmed.slice(match[0].length).replace(/^[:.\s-]+/, '').trim();
    if (leftover.length === 0) {
      return heading.key;
    }
  }
  return undefined;
}

function isHeadingLine(line: string): boolean {
  return headingKey(line) !== undefined;
}

/**
 * Makes glued PDF Hebrew (e.g. חובתנוכחות100%) readable without inventing words.
 */
export function normalizeSyllabusText(text: string): string {
  let normalized = text
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  for (const [from, to] of COMPACT_PHRASES) {
    if (normalized.includes(from)) {
      normalized = normalized.split(from).join(to);
    }
  }

  normalized = normalized
    .replace(/([\u0590-\u05FF])([A-Za-z0-9])/g, '$1 $2')
    .replace(/([A-Za-z0-9%])([\u0590-\u05FF])/g, '$1 $2')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return normalized;
}

function extractKeywordSnippets(text: string, pattern: RegExp, radius = 2): string | undefined {
  const lines = text.split('\n');
  const kept: string[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue;
    const end = Math.min(lines.length, i + radius + 1);
    for (let j = i; j < end; j++) {
      if (seen.has(j)) continue;
      if (j > i && isHeadingLine(lines[j]) && headingKey(lines[j]) !== 'attendance') break;
      seen.add(j);
      const line = lines[j].trim();
      if (line) kept.push(line);
    }
  }
  if (kept.length === 0) return undefined;
  return kept.join('\n');
}

function splitSections(text: string): Partial<Record<keyof SyllabusContent, string>> {
  const lines = text.split('\n');
  const buckets: Partial<Record<keyof SyllabusContent, string[]>> = {};
  let current: keyof SyllabusContent | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (!current || buffer.length === 0) return;
    const body = buffer.join('\n').trim();
    if (body) {
      buckets[current] = [...(buckets[current] || []), body];
    }
    buffer = [];
  };

  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      flush();
      current = key;
      const rest = line.replace(/^[•\-*]\s*/, '').replace(/^[^:]{0,40}:\s*/, '').trim();
      buffer = rest && !isHeadingLine(rest) ? [rest] : [];
      continue;
    }
    if (current) {
      buffer.push(line);
    }
  }
  flush();

  const sections: Partial<Record<keyof SyllabusContent, string>> = {};
  for (const [key, parts] of Object.entries(buckets) as Array<[keyof SyllabusContent, string[]]>) {
    const joined = parts.join('\n').trim();
    if (joined) sections[key] = joined;
  }
  return sections;
}

/**
 * Pulls attendance, grading, topics, exam, and other syllabus rules out of
 * ingested PDF text. Only returns spans that appear in the source.
 */
export function parseSyllabusContent(raw: string): SyllabusContent {
  const text = normalizeSyllabusText(raw);
  const sections = splitSections(text);
  const content: SyllabusContent = {};

  const attendance =
    sections.attendance ||
    extractKeywordSnippets(
      text,
      /נוכחות|חובת נוכחות|attendance|must attend|חובה להופיע|להופיע לכל/i
    );
  if (attendance) content.attendance = attendance;

  if (sections.grading) content.grading = sections.grading;
  else {
    const grading = extractKeywordSnippets(text, /הרכב הציון|קביעת הציון|בחינות ומדיניות|%\s*(בחינה|מבחן|פרויקט|תרגיל)/);
    if (grading) content.grading = grading;
  }

  if (sections.exam) content.exam = sections.exam;
  if (sections.topics) content.topics = sections.topics;
  if (sections.objectives) content.objectives = sections.objectives;
  if (sections.learningOutcomes) content.learningOutcomes = sections.learningOutcomes;
  if (sections.requirements) content.requirements = sections.requirements;
  if (sections.teachingMethods) content.teachingMethods = sections.teachingMethods;
  if (sections.bibliography) content.bibliography = sections.bibliography;
  if (sections.aiPolicy) content.aiPolicy = sections.aiPolicy;

  return content;
}

export function attachSyllabusContent<T extends { syllabusText?: string }>(
  row: T
): T & { syllabus?: SyllabusContent } {
  if (!row.syllabusText) {
    return row;
  }
  const syllabusText = normalizeSyllabusText(row.syllabusText);
  const syllabus = parseSyllabusContent(syllabusText);
  return {
    ...row,
    syllabusText,
    ...(Object.keys(syllabus).length > 0 ? { syllabus } : {}),
  };
}
