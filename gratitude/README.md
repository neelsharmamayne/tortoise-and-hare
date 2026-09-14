# Three Good Things

A private, self-hosted gratitude journal that feels like opening Apple Notes.
Three small things every evening; see them again every morning.

- **Private by default.** Everything you write is stored on your phone (browser storage). Nothing is uploaded, there's no account, and no server ever sees an entry.
- **One tap away.** It's a Progressive Web App (PWA): add it to your Home Screen and it opens full-screen, instantly, offline.
- **Fast to fill out.** Three numbered lines, autosave as you type, Enter for the next line, and a mic button for talking it out.
- **Morning mode.** Before noon the app opens showing last night's gratitudes (plus one from the archive) so you start the day with them.
- **Gentle gamification.** Streak counter, a year heatmap, weekly bars, milestone badges, and the words that keep coming up.
- **Optional passcode** so a borrowed phone doesn't mean a read journal.
- **Backups** as a small JSON file you can export and re-import.

Files: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`. No build step, no dependencies.

---

## 1. Host it (pick one)

The app is static files, so any HTTPS host works. HTTPS is required for Home Screen install, offline mode, and the mic.

**GitHub Pages (easiest, free, private URL).**
Push this repo, then Settings → Pages → deploy from `main`. The journal will be at
`https://<you>.github.io/<repo>/gratitude/`. The URL is unguessable enough for most people; your data never goes to GitHub either way, only the app files do. Set a passcode in the app if you want a second layer.

**Your own server / NAS.** Copy the `gratitude/` folder behind any web server (Caddy, nginx, Synology Web Station…) with HTTPS.

**The bundled Node server** (also gives you push reminders, see §3):
```bash
cd gratitude/server
npm install
npm run keys            # prints VAPID keys
cp .env.example .env    # paste the keys in, set a long random API_TOKEN
npm start               # serves the app at http://localhost:3000
```
Put it behind HTTPS (Caddy, Cloudflare Tunnel, Tailscale Serve, etc.). A `Dockerfile` and `docker-compose.yml` are in `server/` too:
```bash
cd gratitude && docker compose -f server/docker-compose.yml up -d
```

Try it locally without installing anything: `npx http-server gratitude -p 8080` and open http://localhost:8080.

## 2. Put it on your phone

**iPhone:** open the URL in Safari → Share → **Add to Home Screen**. It launches full-screen with the sun-leaf icon.
**Android:** open in Chrome → menu → **Install app** / Add to Home screen.

Long-press the icon for shortcuts to *Write tonight's entry* and *Morning reflection*.

### Voice

Tap the orange mic to dictate straight into the next empty line (uses the browser's speech recognition; works in Safari and Chrome). Or just use the keyboard's dictation key like you would in Notes.

## 3. Reminders

You want two nudges: **morning** ("here's what you were grateful for") and **evening** ("write tonight's three"). Two ways to get them.

### Option A — iOS Shortcuts automations (no server, 2 minutes)

This is the simplest, and it's what I'd start with.

1. Shortcuts app → **Automation** → **+** → **Time of Day** → e.g. 7:30 AM, Daily → *Run Immediately*.
2. Action: **Open URL** → `https://your-journal-url/?view=morning`
3. Repeat for the evening: 9:00 PM → **Open URL** → `https://your-journal-url/?view=write`

Each automation opens the app straight into the right screen. (You can also use a plain Reminder or Alarm named "3 good things" if you prefer a notification you dismiss yourself.)

Android: use the Clock app's alarms or an automation app to open the same URLs.

### Option B — real push notifications (bundled server)

Run the Node server from §1, then in the app: Settings → Push notifications → enter the server URL and the `API_TOKEN` from your `.env` → **Enable reminders**. You'll get a test notification immediately, then a morning and an evening push at the times you set (in your phone's time zone). Tapping one opens the right screen.

The server only stores your push subscription and reminder times. It never receives an entry; the notification is just a nudge and the app shows your own on-device data.

Notes: on iPhone, push requires iOS 16.4+ and the app must be added to the Home Screen first. The server needs to be reachable over HTTPS from your phone.

## 4. Backups

Your entries live only on the device, so a phone reset or clearing Safari data would erase them. Settings → **Export backup** saves `gratitude-backup-YYYY-MM-DD.json` (put it in iCloud Drive). **Import backup** merges it back, never overwriting.

## 5. How the pieces fit

| Piece | What it does |
|---|---|
| `app.js` | All logic: entries, streaks, morning/evening modes, voice, insights, passcode, export/import, push subscription |
| `sw.js` | Caches the app for offline/instant load; shows push notifications; opens the right view when tapped |
| `manifest.webmanifest` | Makes it installable; defines icon, name, Home Screen shortcuts |
| `server/server.js` | Optional. Serves the app, stores subscriptions, sends morning/evening pushes every minute-check |

Data format in `localStorage` (`tgt.entries`):
```json
{ "2026-09-14": { "items": ["Coffee on the porch", "The rain stopped", "Finished the report"], "updatedAt": 1789419600000 } }
```
