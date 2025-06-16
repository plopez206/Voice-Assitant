import express, { Request, Response, NextFunction } from 'express';
import { getAvailability, bookAppointment } from './appointmentAgent';
import 'dotenv/config';

const app = express();
app.use(express.json());

/* ─────────────────────────────  NOW  ────────────────────────────── */
// Returns current date & time in Europe/Madrid as "YYYY-MM-DD, HH:MM"
app.get('/now', (_req: Request, res: Response) => {
  const nowEs = new Date().toLocaleString('sv-SE', {
    timeZone: 'Europe/Madrid', // always Spanish time
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(' ', ', '); // sv-SE gives 2025-06-16 16:04 -> we turn to 2025-06-16, 16:04

  res.json({ now: nowEs });
});

/* ────────────────────────── UTILITIES ───────────────────────────── */
const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe    = /^\d{2}:\d{2}$/;

function validateDate(date: string) {
  if (!isoDateRe.test(date)) throw new Error('Date must be YYYY-MM-DD');
}

function validateTime(time: string) {
  if (!timeRe.test(time)) throw new Error('Time must be HH:MM (24h)');
}

/* ────────────────────────── getAvailability ─────────────────────── */
app.post('/getAvailability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: date } = req.body as { Date: string };
    validateDate(date);
    const slots = await getAvailability(date);
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────── bookingTime ────────────────────────── */
app.post('/bookingTime', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: date, Time: time, fullName } = req.body as { Date: string; Time: string; fullName: string };
    validateDate(date);
    validateTime(time);

    // No need to calculate startLocal and endLocal here, bookAppointment handles it
    const event = await bookAppointment({
      name: fullName,
      date,
      time,
      description: 'Reservado vía Al Norte AI',
    });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

/* ─────────────────────────── root page ──────────────────────────── */
app.get('/', (_req: Request, res: Response) => {
  res.send(`
<h2>Al Norte API</h2>
<ul>
  <li>GET  /now                → { now: "YYYY-MM-DD, HH:MM" }</li>
  <li>POST /getAvailability    → body { Date }</li>
  <li>POST /bookingTime        → body { Date, Time, fullName }</li>
</ul>`);
});

/* ─────────────────────────── listen ─────────────────────────────── */
const PORT = process.env.PORT ?? 3003;
(async () => {
  await app.listen(PORT);
  console.log(`🚀 API ready on http://localhost:${PORT}`);
})();