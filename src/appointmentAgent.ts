import { google, calendar_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import 'dotenv/config';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/* ─────────────────────────── helpers ─────────────────────────── */

function getCalendarClient(): calendar_v3.Calendar {
  const raw = process.env.GOOGLE_CREDENTIALS;
  if (!raw) throw new Error('Missing GOOGLE_CREDENTIALS');

  const { client_email, private_key } = JSON.parse(raw);
  const auth = new JWT({ email: client_email, key: private_key, scopes: SCOPES });

  return google.calendar({ version: 'v3', auth });
}

/** remove “Z” or “±HH:MM” so Calendar treats string as local */
const stripOffset = (dt: string) => dt.replace(/([+-]\\d{2}:\\d{2}|Z)$/u, '');

/* ─────────────────────────── availability ────────────────────── */

export async function getAvailability(
  date: string,
  durationMinutes = 30,
  timeZone = 'Europe/Madrid'
): Promise<{ start: string; end: string }[]> {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) {
    throw new Error('Invalid date format. Use “YYYY-MM-DD”.');
  }

  const calendar   = getCalendarClient();
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
  const slotMs    = durationMinutes * 60 * 1000;
  const free: { start: string; end: string }[] = [];

  for (let t = workStart; t + slotMs <= workEnd; t += slotMs) {
    const overlaps = busy.some(({ start, end }) => {
      const bStart = Date.parse(start);
      const bEnd   = Date.parse(end);
      return t < bEnd && t + slotMs > bStart;
    });

    if (!overlaps) {
      free.push({
        start: new Date(t).toISOString(),
        end:   new Date(t + slotMs).toISOString(),
      });
    }
  }
  return free;
}

/* ─────────────────────────── booking ─────────────────────────── */

export async function bookAppointment(args: {
  name: string;
  phone?: string;
  start: string;  // expect “YYYY-MM-DDTHH:MM[:SS][±HH:MM|Z]”
  end:   string;
  description?: string;
}): Promise<calendar_v3.Schema$Event> {
  const calendar   = getCalendarClient();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? 'primary';

  // Calendar API: usa dateTime local + timeZone O  dateTime+offset. Elegimos lo 1º.
  const startLocal = stripOffset(args.start);
  const endLocal   = stripOffset(args.end);

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary:       `Cita – ${args.name}`,
      description:   args.description ?? '',
      start: { dateTime: startLocal, timeZone: 'Europe/Madrid' },
      end:   { dateTime: endLocal,   timeZone: 'Europe/Madrid' },
      attendees: args.phone
        ? [{ displayName: args.name, email: `${args.phone}@example.invalid` }]
        : undefined,
    },
  });

  return event.data;
}
