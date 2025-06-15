import { google, calendar_v3 } from "googleapis";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";
dotenv.config();

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getCalendarClient(): calendar_v3.Calendar {
  const credentialsJSON = process.env.GOOGLE_CREDENTIALS
    ? JSON.parse(process.env.GOOGLE_CREDENTIALS)
    : undefined;

  const auth = new JWT({
    email: credentialsJSON?.client_email,
    key: credentialsJSON?.private_key,
    scopes: SCOPES,
  });

  return google.calendar({ version: "v3", auth });
}

export async function getAvailability(
  date: string,
  durationMinutes: number = 30,
  timeZone: string = "Europe/Madrid"
): Promise<{ start: string; end: string }[]> {
  const calendar = getCalendarClient();
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? "primary";

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone,
      items: [{ id: calendarId }],
    },
  });

  const busy: { start: string; end: string }[] =
    (data.calendars?.[calendarId].busy ?? [])
      .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
      .map(b => ({ start: b.start as string, end: b.end as string }));

  const workStart = new Date(`${date}T09:00:00${offset(timeZone)}`).getTime();
  const workEnd = new Date(`${date}T18:00:00${offset(timeZone)}`).getTime();
  const slot = durationMinutes * 60 * 1000;
  const free: { start: string; end: string }[] = [];

  for (let t = workStart; t + slot <= workEnd; t += slot) {
    const slotStart = t;
    const slotEnd = t + slot;
    const overlaps = busy.some(({ start, end }) => {
      const busyStart = new Date(start).getTime();
      const busyEnd = new Date(end).getTime();
      return slotStart < busyEnd && slotEnd > busyStart;
    });
    if (!overlaps) {
      free.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
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
  const calendarId = process.env.PRIMARY_CALENDAR_ID ?? "primary";

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Cita – ${args.name}`,
      description: args.description ?? "",
      start: { dateTime: args.start },
      end: { dateTime: args.end },
      attendees: args.phone
        ? [{ displayName: args.name, email: `${args.phone}@example.invalid` }]
        : undefined,
    },
  });

  return event.data;
}

function offset(tz: string): string {
  const dt = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = formatter.formatToParts(dt);
  const [h, m] = [
    parts.find((p) => p.type === "hour")?.value ?? "00",
    parts.find((p) => p.type === "minute")?.value ?? "00",
  ];
  const local = new Date();
  local.setHours(parseInt(h), parseInt(m));
  const offsetMin = (local.getTime() - dt.getTime()) / 60000;
  const sign = offsetMin >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${sign}${pad(Math.floor(Math.abs(offsetMin) / 60))}:${pad(
    Math.abs(offsetMin) % 60
  )}`;
}
