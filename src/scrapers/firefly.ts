import * as cheerio from 'cheerio';

export const FIREFLY_BASE_URL = 'https://info.braude.ac.il/yedion/fireflyweb.aspx';

export const FIREFLY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface CookieJar {
  cookies: Map<string, string>;
}

export interface FireflySession {
  jar: CookieJar;
  /** Gregorian year label used by FireFly (e.g. "2027" for תשפ"ז). Never hardcode. */
  year: string;
}

export function createCookieJar(): CookieJar {
  return { cookies: new Map<string, string>() };
}

export function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.cookies.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function readSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

export function applySetCookie(jar: CookieJar, response: Response): void {
  for (const raw of readSetCookieHeaders(response)) {
    const pair = raw.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) {
      jar.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

/**
 * Heuristic fallback when the portal dropdown cannot be read.
 * Braude labels academic years by the Gregorian year they end in;
 * new catalogs typically appear from August.
 */
export function fallbackAcademicYear(now: Date = new Date()): string {
  return String(now.getFullYear() + (now.getMonth() >= 7 ? 1 : 0));
}

export function parseYearDropdown(html: string): string[] {
  const $ = cheerio.load(html);
  const years = new Set<number>();
  $('select[name="ChangeYear"] option, select[name="R1C39"] option').each((_, opt) => {
    const val = $(opt).attr('value');
    if (val && /^\d{4}$/.test(val)) {
      years.add(parseInt(val, 10));
    }
  });
  return Array.from(years)
    .sort((a, b) => b - a)
    .map(String);
}

export function academicYearRange(yearLabel: string): string {
  const end = Number(yearLabel);
  if (!Number.isFinite(end)) {
    return yearLabel;
  }
  return `${end - 1}-${end}`;
}

async function fireflyFetch(
  jar: CookieJar,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  redirectsLeft: number = 5
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('User-Agent', FIREFLY_USER_AGENT);
  const existingCookie = cookieHeader(jar);
  if (existingCookie) {
    headers.set('Cookie', existingCookie);
  }

  const response = await fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  applySetCookie(jar, response);

  if (response.status >= 300 && response.status < 400 && redirectsLeft > 0) {
    const location = response.headers.get('location');
    if (location) {
      const nextUrl = new URL(location, url).toString();
      return fireflyFetch(jar, nextUrl, { method: 'GET' }, timeoutMs, redirectsLeft - 1);
    }
  }

  return response;
}

export async function fireflyGet(
  jar: CookieJar,
  prgname: string,
  extraParams: Record<string, string> = {},
  timeoutMs: number = 8000
): Promise<string> {
  const url = new URL(FIREFLY_BASE_URL);
  url.searchParams.set('appname', 'BSHITA');
  url.searchParams.set('prgname', prgname);
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }
  const response = await fireflyFetch(jar, url.toString(), { method: 'GET' }, timeoutMs);
  if (!response.ok) {
    throw new Error(`FireFly GET ${prgname} failed: HTTP ${response.status}`);
  }
  return response.text();
}

export async function fireflyPost(
  jar: CookieJar,
  prgname: string,
  args: string,
  fields: Record<string, string> = {},
  timeoutMs: number = 15000
): Promise<string> {
  const body = new URLSearchParams();
  body.set('appname', 'BSHITA');
  body.set('PRGNAME', prgname);
  body.set('ARGUMENTS', args);
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  const response = await fireflyFetch(
    jar,
    FIREFLY_BASE_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`FireFly POST ${prgname} failed: HTTP ${response.status}`);
  }
  return response.text();
}

export function isRateLimitedHtml(html: string): boolean {
  return html.includes('השהיית גישה זמנית') || html.includes('יותר מידי שאילתות');
}

/**
 * Opens a FireFly session and POSTs "מעבר שנה" so subsequent queries use the
 * latest academic year from the portal dropdown (not a hardcoded value).
 */
export async function openLatestYearSession(
  timeoutMs: number = 8000,
  preferredYear?: string
): Promise<FireflySession> {
  const jar = createCookieJar();
  const enterHtml = await fireflyGet(jar, 'Enter_Search', {}, timeoutMs);
  const years = parseYearDropdown(enterHtml);
  const year = preferredYear && years.includes(preferredYear) ? preferredYear : years[0] || fallbackAcademicYear();

  const switchedHtml = await fireflyPost(
    jar,
    'Enter_Search',
    '-A,,-A,ChangeYear',
    { ChangeYear: year },
    timeoutMs
  );
  if (isRateLimitedHtml(switchedHtml)) {
    throw new Error('FireFly rate-limited while switching academic year');
  }

  return { jar, year };
}
