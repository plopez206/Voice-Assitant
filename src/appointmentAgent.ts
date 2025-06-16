import { google, calendar_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { format } from 'date-fns';
import 'dotenv/config';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TZ     = 'Europe/Madrid';
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;          // YYYY-MM-DD

/* ───────────── Google Calendar auth ────────────── */
function getCalendar(): calendar_v3.Calendar {
  const raw = process.env.GOOGLE_CREDENTIALS;
  if (!raw) throw new Error('Missing GOOGLE_CREDENTIALS');

  const { client_email, private_key } = JSON.parse(raw);
  const auth = new JWT({ email: client_email, key: private_key, scopes: SCOPES });

  return google.calendar({ version: 'v3', auth });
}

/* ───────────── helper: normaliza fecha ─────────── */
function toISODate(raw: string): string {
  const trimmed = raw.trim();
  if (ISO_RE.test(trimmed)) return trimmed;               // ya es ISO
  const parsed = new Date(trimmed);
  if (isNaN(parsed.valueOf())) {
    throw new Error('Invalid date. Provide YYYY-MM-DD or a valid date string.');
  }
  return format(parsed, 'yyyy-MM-dd');                    // normaliza
}

/* ───────────── availability ─────────────────────── */
export async function getAvailability(
  rawDate: string,
  durationMinutes = 30
): Promise<{ start: string; end: string }[]> {
  const date = toISODate(rawDate);                        // ← usa helper

  const calendar   = getCalendar();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? 'primary';

  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  const { data } = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, timeZone: TZ, items: [{ id: calendarId }] },
  });

  const busy = (data.calendars?.[calendarId].busy ?? []) as { start: string; end: string }[];

  const dayStart = Date.parse(`${date}T09:00:00Z`);
  const dayEnd   = Date.parse(`${date}T18:00:00Z`);
  const slotMs   = durationMinutes * 60_000;
  const free: { start: string; end: string }[] = [];

  for (let t = dayStart; t + slotMs <= dayEnd; t += slotMs) {
    const overlaps = busy.some(({ start, end }) => t < Date.parse(end) && t + slotMs > Date.parse(start));
    if (!overlaps) free.push({ start: new Date(t).toISOString(), end: new Date(t + slotMs).toISOString() });
  }
  return free;
}

/* ───────────── booking ─────────────────────────── */
export async function bookAppointment(args: {
  name: string;
  phone?: string;
  date: string;  // YYYY-MM-DD or parseable
  time: string;  // HH:MM (24 h)
  description?: string;
}): Promise<calendar_v3.Schema$Event> {
  const date = toISODate(args.date);
  if (!/^\d{2}:\d{2}$/.test(args.time)) throw new Error('Time must be HH:MM (24 h)');

  const calendar   = getCalendar();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? 'primary';

  const startLocal = `${date}T${args.time}:00`;
  const endISO     = new Date(Date.parse(startLocal) + 30 * 60_000)
                       .toISOString().replace('Z', ''); // mismo offset local

  return (
    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary:     `Cita – ${args.name}`,
        description: args.description ?? '',
        start: { dateTime: startLocal, timeZone: TZ },
        end:   { dateTime: endISO,    timeZone: TZ },
        attendees: args.phone
          ? [{ displayName: args.name, email: `${args.phone}@example.invalid` }]
          : undefined,
      },
    })
  ).data;
}