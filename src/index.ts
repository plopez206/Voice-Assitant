import express, { Request, Response, NextFunction } from 'express';
import { getAvailability, bookAppointment } from './appointmentAgent';
import 'dotenv/config';

const app = express();
app.use(express.json());

/**
 * Convert "YYYY-MM-DD" + "hh:mm" → ISO string in UTC.
 * Example: ("2025-06-20", "15:30") → "2025-06-20T13:30:00.000Z"
 */
function toISO(date: string, time: string) {
  if (!/:\d{2}$/.test(time)) time += ':00'; // ensure seconds
  return new Date(`${date}T${time}`).toISOString();
}

// ────────────────────────── getAvailability ────────────────────────────
app.post('/getAvailability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: date } = req.body;
    const slots = await getAvailability(date);
    res.json(slots);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── bookingTime ───────────────────────────────
app.post('/bookingTime', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { Date: date, Time: time, fullName } = req.body;

    const startIso = toISO(date, time);
    const endIso   = new Date(new Date(startIso).getTime() + 30 * 60_000).toISOString();

    const event = await bookAppointment({
      name: fullName,
      start: startIso,
      end: endIso,
      description: 'Reservado vía Al Norte AI'
    });

    res.json(event);
  } catch (err) {
    next(err);
  }
});

app.get('/', (_req: Request, res: Response) => {
  res.send(`
<h2>Al Norte AI Appointment API</h2>
<ul>
  <li><code>POST /getAvailability</code> – Check free slots</li>
  <li><code>POST /bookingTime</code> – Book an appointment</li>
</ul>
`);
});

const PORT = process.env.PORT ?? 3003;
(async () => {
  await app.listen(PORT);
  console.log(`🚀 API ready on http://localhost:${PORT}`);
})();