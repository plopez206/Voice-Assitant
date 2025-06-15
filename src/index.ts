// src/index.ts --------------------------------------------------
import express, { Request, Response, NextFunction } from 'express';
import { getAvailability, bookAppointment } from './appointmentAgent';
import 'dotenv/config';

const app = express();
app.use(express.json());

/** helper – combine “2025-06-20” + “15:30” into an ISO string */
function toISO(date: string, time: string, tz = 'Europe/Madrid') {
  // add “:00” seconds if not provided → “15:30:00”
  if (!/:\d\d$/.test(time)) time += ':00';
  // append TZ offset (“+02:00” in summer Spain)
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  })
    .formatToParts(new Date())
    .reduce((acc, p) => (p.type === 'hour' || p.type === 'minute') ? acc + p.value : acc, '')
    .match(/(\d{2})(\d{2})/)!;
  const sign = new Date().getTimezoneOffset() <= 0 ? '+' : '-';
  const tzIso = `${sign}${offset[1]}:${offset[2]}`;
  return `${date}T${time}${tzIso}`;
}

/*────────────────────────── getAvailability ──────────────────────────*
 * ElevenLabs → POST /getAvailability
 * body: { "Date": "...", "Time": "..." }  (Time is ignored here)
 * returns: [ { start, end }, ... ]
 *--------------------------------------------------------------------*/
app.post(
  '/getAvailability',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { Date: date } = req.body;
      const slots = await getAvailability(date);
      res.json(slots);
    } catch (err) {
      next(err);          // deja que Express gestione el error
    }
  }
);

/*────────────────────────── bookingTime ──────────────────────────────*
 * ElevenLabs → POST /bookingTime
 * body: { "Date": "...", "Time": "...", "fullName": "..." }
 *--------------------------------------------------------------------*/
app.post(
  '/bookingTime',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { Date: date, Time: time, fullName } = req.body;
      const startIso = toISO(date, time);
      const endIso   = new Date(new Date(startIso).getTime() + 30 * 60_000)
                         .toISOString();

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
  }
);

app.get('/', (req: Request, res: Response) => {
  res.send(`
Welcome to the Al Norte AI Appointment API!<br>
This API allows you to check availability and book appointments.<br>
You can use the following endpoints:<br>
<ul>
    <li><code>POST /getAvailability</code> - Check available appointment slots.</li>
    <li><code>POST /bookingTime</code> - Book an appointment.</li>
</ul>
For more information, please refer to the documentation.
  `);
});   

/*───────────────────────── start server ─────────────────────────────*/
const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () =>
  console.log(`🚀 API ready on https://localhost:${PORT} (remember: HTTPS!)`)
);
