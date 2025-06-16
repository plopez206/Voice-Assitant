import { google, calendar_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import 'dotenv/config';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

function getCalendarClient(): calendar_v3.Calendar {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : undefined;
  
  if (!credentialsJSON) {
    throw new Error("Missing or invalid GOOGLE_CREDENTIALS");
  }

  const auth = new JWT({
    email: credentialsJSON?.client_email,
    key: credentialsJSON?.private_key,
    scopes: SCOPES,
  });

  return google.calendar({ version: 'v3', auth });
}

export async function getAvailability(
  date: string,
  durationMinutes = 30,
  timeZone = 'Europe/Madrid'
): Promise<{ start: string; end: string }[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid date format. Use "YYYY-MM-DD".');
  }
  const calendar = getCalendarClient();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? 'primary';

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  const { data } = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, timeZone, items: [{ id: calendarId }] },
  });

  const busy: { start: string; end: string }[] =
    (data.calendars?.[calendarId].busy ?? []) as { start: string; end: string }[];

  const workStart = new Date(`${date}T09:00:00`).getTime();
  const workEnd   = new Date(`${date}T18:00:00`).getTime();
  const slot = durationMinutes * 60 * 1000;
  const free: { start: string; end: string }[] = [];

  for (let t = workStart; t + slot <= workEnd; t += slot) {
    const slotStart = t;
    const slotEnd   = t + slot;
    const overlaps = busy.some(({ start, end }) => {
      const bStart = new Date(start).getTime();
      const bEnd   = new Date(end).getTime();
      return slotStart < bEnd && slotEnd > bStart;
    });
    if (!overlaps) {
      free.push({
        start: new Date(slotStart).toISOString(),
        end:   new Date(slotEnd).toISOString(),
      });
    }
  }
  return free;
}

export async function bookAppointment(args: {
  name: string;
  phone?: string;
  start: string;
  end: string;
  description?: string;
}): Promise<calendar_v3.Schema$Event> {
  const calendar = getCalendarClient();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? 'primary';

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Cita – ${args.name}`,
      description: args.description ?? '',
      start: { dateTime: args.start, timeZone: 'Europe/Madrid' },
      end:   { dateTime: args.end,   timeZone: 'Europe/Madrid' },
      attendees: args.phone ? [{ displayName: args.name, email: `${args.phone}@example.invalid` }] : undefined,
    },
  });

  return event.data;
}
