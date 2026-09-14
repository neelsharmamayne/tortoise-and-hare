/* Three Good Things — optional reminder server
   ------------------------------------------------------------------
   - Serves the journal (../) as static files.
   - Stores push subscriptions (subscriptions.json) with each device's
     preferred morning/evening times and time zone.
   - Every minute, sends a push to devices whose local time matches.
   The server never receives or stores any journal entries. The push
   payload is only a nudge; the app shows your gratitudes from the
   data on your device.
*/
import express from 'express';
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dependency).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = 'mailto:admin@example.com', API_TOKEN, PORT = 3000 } = process.env;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('Missing VAPID keys. Run `npm run keys`, then put them in .env (see .env.example).');
  process.exit(1);
}
if (!API_TOKEN || API_TOKEN === 'change-me-to-something-long-and-random') {
  console.error('Set API_TOKEN in .env to a long random string. The app needs the same token to subscribe.');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DATA_DIR = process.env.DATA_DIR || __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB = path.join(DATA_DIR, 'subscriptions.json');
let subs = [];
try { subs = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { subs = []; }
const persist = () => fs.writeFileSync(DB, JSON.stringify(subs, null, 2));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const auth = (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token !== API_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
};

app.get('/api/vapid', auth, (_req, res) => res.json({ publicKey: VAPID_PUBLIC_KEY }));

app.post('/api/subscribe', auth, async (req, res) => {
  const { subscription, morning = '07:30', evening = '21:00', tz = 'UTC' } = req.body || {};
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'missing subscription' });
  const valid = (t) => /^\d{2}:\d{2}$/.test(t);
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return res.status(400).json({ error: 'bad time zone' }); }
  const entry = { subscription, morning: valid(morning) ? morning : '07:30', evening: valid(evening) ? evening : '21:00', tz, sent: {} };
  const i = subs.findIndex((s) => s.subscription.endpoint === subscription.endpoint);
  if (i >= 0) subs[i] = { ...subs[i], ...entry }; else subs.push(entry);
  persist();
  res.status(201).json({ ok: true });
  send(entry, { title: 'Reminders are on', body: `Morning at ${entry.morning}, evening at ${entry.evening}. See you then.`, view: 'today' }).catch(() => {});
});

app.delete('/api/subscribe', auth, (req, res) => {
  const { endpoint } = req.body || {};
  subs = subs.filter((s) => s.subscription.endpoint !== endpoint);
  persist();
  res.status(204).end();
});

// Serve the journal itself from the parent folder.
app.use(express.static(path.join(__dirname, '..'), { index: 'index.html', extensions: ['html'] }));

async function send(sub, payload) {
  try {
    await webpush.sendNotification(sub.subscription, JSON.stringify(payload), { TTL: 60 * 60 });
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      subs = subs.filter((s) => s.subscription.endpoint !== sub.subscription.endpoint);
      persist();
      console.log('Removed expired subscription');
    } else {
      console.error('Push failed:', err.statusCode || err.message);
    }
  }
}

const MORNING = [
  'Good morning. Take 20 seconds to remember what you were grateful for last night.',
  'Before the day starts: here are the good things you noticed yesterday.',
  'A small reminder of what went right. Tap to see last night\'s gratitudes.'
];
const EVENING = [
  'What went well today? Jot down three good things.',
  'Evening check-in: three things you\'re grateful for today.',
  'Before bed, notice three good things from today. It only takes a minute.'
];

function localHHMMAndDate(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
  return { hhmm: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`, date: `${parts.year}-${parts.month}-${parts.day}` };
}

async function tick() {
  for (const sub of [...subs]) {
    const { hhmm, date } = localHHMMAndDate(sub.tz || 'UTC');
    const pick = (arr) => arr[Math.floor(Date.now() / 86400000) % arr.length];
    if (hhmm === sub.morning && sub.sent.morning !== date) {
      sub.sent.morning = date; persist();
      await send(sub, { title: 'Good morning ☀️', body: pick(MORNING), view: 'morning' });
    }
    if (hhmm === sub.evening && sub.sent.evening !== date) {
      sub.sent.evening = date; persist();
      await send(sub, { title: 'Three good things 🌙', body: pick(EVENING), view: 'write' });
    }
  }
}
setInterval(() => tick().catch(console.error), 30 * 1000);

app.listen(PORT, () => console.log(`Three Good Things is running at http://localhost:${PORT}  (${subs.length} device${subs.length === 1 ? '' : 's'} subscribed)`));
