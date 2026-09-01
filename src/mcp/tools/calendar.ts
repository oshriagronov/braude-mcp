import { getAcademicCalendarFromDb, type D1Database } from '../../db/client.js';

export async function handleGetAcademicCalendar(
  args: Record<string, unknown>,
  db?: D1Database
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
  try {
    const rawYear = args.year;
    const year =
      typeof rawYear === 'string' || typeof rawYear === 'number'
        ? String(rawYear).trim()
        : undefined;

    const calendarData = await getAcademicCalendarFromDb(year, db);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(calendarData, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error fetching academic calendar: ${error?.message || String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
