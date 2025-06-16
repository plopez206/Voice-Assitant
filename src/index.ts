import express, { Request, Response, NextFunction } from 'express';
import { getAvailability, bookAppointment } from './appointmentAgent';
import 'dotenv/config';
import {
  addDays,
  format,
  nextDay,
  isMatch,
  type Day,
} from 'date-fns';

// Map días de la semana (minúsculas) → número date-fns (0=domingo … 6=sábado)
const WEEKDAYS_ES: Record<string, Day> = {
  lunes: 1,
  martes: 2,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  domingo: 0,
};

const app = express();
app.use(express.json());

/**
 * Convierte expresiones de fecha en español ("hoy", "lunes"…) a «YYYY-MM-DD».
 */
function resolveDate(raw: string): string {
  const today = new Date();
  const lower = raw.trim().toLowerCase();

  if (isMatch(lower, 'yyyy-MM-dd')) return lower;        // ya viene ISO
  if (lower === 'hoy')       return format(today, 'yyyy-MM-dd');
  if (lower === 'mañana')    return format(addDays(today, 1), 'yyyy-MM-dd');

  const weekday = WEEKDAYS_ES[lower];
  if (weekday !== undefined) return format(nextDay(today, weekday), 'yyyy-MM-dd');

  const parsed = new Date(raw);
  if (!isNaN(parsed.valueOf())) return format(parsed, 'yyyy-MM-dd');

  throw new Error('Fecha no reconocida');
}

/**
 * Construye un ISO con el offset real de Europe/Madrid para la fecha/hora dadas.
 */
function toISOWithTZ(date: string, time: string): string {
  if (!/:\d{2}$/.test(time)) time += ':00';
  const local = new Date(`${date}T${time}`);     // se crea en zona local
  const offsetMin = -local.getTimezoneOffset();  // en minutos
  const sign = offsetMin >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const hh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const mm = pad(Math.abs(offsetMin) % 60);
  return `${format(local, "yyyy-MM-dd'T'HH:mm:ss")}${sign}${hh}:${mm}`;
}

// ────────────────────────── ENDPOINTS ──────────────────────────

app.post('/getAvailability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: rawDate } = req.body as { Date: string };
    const date = resolveDate(rawDate);
    const slots = await getAvailability(date);
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

app.post('/bookingTime', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: rawDate, Time: time, fullName } = req.body as {
      Date: string;
      Time: string;
      fullName: string;
    };

    const date     = resolveDate(rawDate);
    const startIso = toISOWithTZ(date, time);

    // 30 min después del start → endIso con mismo offset
    const endJS  = new Date(new Date(startIso).getTime() + 30 * 60_000);
    const offset = startIso.slice(-6); // «+02:00» o «+01:00»
    const endIso = format(endJS, "yyyy-MM-dd'T'HH:mm:ss") + offset;

    const event = await bookAppointment({
      name: fullName,
      start: startIso,
      end: endIso,
      description: 'Reservado vía Al Norte AI',
    });

    res.json(event);
  } catch (err) {
    next(err);
  }
});

app.get('/', (_req: Request, res: Response) => {
  res.send('<h2>Al Norte AI Appointment API</h2><ul><li>POST /getAvailability</li><li>POST /bookingTime</li></ul>');
});

const PORT = process.env.PORT ?? 3003;
(async () => {
  await app.listen(PORT);
  console.log(`🚀 API ready on http://localhost:${PORT}`);
})();