import { fetchAcademicCalendar } from '../../scrapers/calendar.js';

export async function handleGetAcademicCalendar(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
  try {
    const rawYear = args.year;
    const year =
      typeof rawYear === 'string' || typeof rawYear === 'number'
        ? String(rawYear).trim()
        : undefined;

    const calendarData = await fetchAcademicCalendar(year);

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
