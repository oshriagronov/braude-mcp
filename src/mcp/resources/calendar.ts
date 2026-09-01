import { getAcademicCalendarFromDb } from '../../db/client.js';

export async function handleReadCurrentCalendar(): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const calendarData = await getAcademicCalendarFromDb();
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
