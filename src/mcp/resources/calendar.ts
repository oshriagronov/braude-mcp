import { getAcademicCalendarFromDb, type D1Database } from '../../db/client.js';

export async function handleReadCurrentCalendar(db?: D1Database): Promise<{
  contents: Array<{ uri: string; mimeType: string; text: string }>;
}> {
  const calendarData = await getAcademicCalendarFromDb(undefined, db);
  if (!calendarData.years.length) {
    throw new Error('Academic calendar is unavailable: no scraped calendar is stored.');
  }
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
