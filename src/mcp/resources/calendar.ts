import { fetchAcademicCalendar } from '../../scrapers/calendar.js';

export async function handleReadCurrentCalendar(): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const calendarData = await fetchAcademicCalendar();
  return {
    contents: [
      {
        uri: 'braude://calendar/current',
        mimeType: 'application/json',
        text: JSON.stringify(calendarData, null, 2),
      },
    ],
  };
}
