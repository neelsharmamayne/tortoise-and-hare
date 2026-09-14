# Three Good Things

A private gratitude journal that is as fast as a sticky note and as pretty as a paper one.
Three good things every evening. See them again every morning.

**Live:** once GitHub Pages is on (see below) it's at `https://neelsharmamayne.github.io/gratitude/`

## Why it feels different

- **One note, not a form.** The app opens with the cursor already in a lined note. One line per gratitude. It saves as you type. There is no save button, no fields, no "+ add".
- **Talk instead of type.** Tap the mic and speak; each session becomes a new line. If the browser's speech engine won't cooperate (it often doesn't inside iOS Home Screen apps), the button hands you straight to the keyboard's dictation key, which always works.
- **Zero-tap capture.** An Action Button or Siri shortcut can dictate a gratitude straight into today's entry without opening the app at all (below).
- **Mornings.** Before noon, last night's gratitudes and one line from the archive sit quietly above the note, so the day starts with them.
- **Gentle gamification.** A streak flame, a year heatmap, weekly bars, milestone badges, and the words that keep coming up.
- **Private by default.** Everything lives on your phone (browser storage). No account, no server, nothing uploaded. Optional passcode. One-tap JSON backup.
- **Installable.** It's a Progressive Web App: add it to the Home Screen and it launches full-screen, instantly, offline, with its own icon.

No build step, no dependencies. `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icons/`.

---

## 1. Turn it on (GitHub Pages, 1 minute)

Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
A minute later the journal is live at `https://neelsharmamayne.github.io/gratitude/`. Only the app files are on GitHub; your entries never leave your phone.

Other options: copy the folder to any HTTPS host, or run the bundled server (§4). HTTPS is required for Home Screen install, offline mode, and the mic.

## 2. Put it on your phone

**iPhone:** open the URL in Safari → **Share** → **Add to Home Screen**. (The app shows a small reminder for this until you do.)
**Android:** open in Chrome → menu → **Install app**.

Long-press the icon for *Write tonight's entry* and *Morning reflection*.

## 3. The fastest way in: Action Button / Siri

Build a Shortcut called **Gratitude** with two actions:

1. **Dictate Text** (Stop Listening: *On Pause*)
2. **Open URLs** → `https://neelsharmamayne.github.io/gratitude/?add=` and then insert the **Dictated Text** variable. Tap the inserted variable and set it to **URL Encoded** (or put a **URL Encode** action between the two).

Assign it to the **Action Button** (Settings → Action Button → Shortcut) or **Back Tap** (Settings → Accessibility → Touch → Back Tap). "Hey Siri, Gratitude" also runs it.
Press, speak, done. The text lands in today's entry and the app flashes "Added ✓".

## 4. Reminders

**Option A — iOS Shortcuts automations (no server, 2 minutes).** Shortcuts → Automation → **+** → Time of Day:
- 7:30 AM daily → **Open URLs** → `https://neelsharmamayne.github.io/gratitude/?view=morning`
- 9:00 PM daily → **Open URLs** → `https://neelsharmamayne.github.io/gratitude/?view=write`

Set both to *Run Immediately*. Each one opens the app on the right screen.

**Option B — real push notifications** with the bundled server (`server/`). It serves the app and sends a morning and evening push at your chosen times, in your time zone. It never sees an entry; a push is only a nudge and the app shows your own on-device data.
```bash
cd server
npm install
npm run keys            # prints VAPID keys
cp .env.example .env    # paste the keys, set a long random API_TOKEN
npm start               # app + API at http://localhost:3000
```
Put it behind HTTPS (Caddy, Tailscale Serve, Cloudflare Tunnel…). Docker: `docker compose -f server/docker-compose.yml up -d` from the repo root.
Then in the app: Settings → Push notifications → server URL + token → **Enable reminders**. On iPhone this requires iOS 16.4+ and the app on the Home Screen.

## 5. Backups

Entries live only on the device, so Settings → **Export backup** now and then (drop the file in iCloud Drive). **Import backup** merges, never overwrites.

## 6. How it's built

| File | Role |
|---|---|
| `app.js` | Entries, streaks, morning strip, voice with fallback, insights, passcode, backup, push subscription, `?add=` quick capture |
| `sw.js` | Offline cache; push notifications; opens the right screen when a notification is tapped |
| `manifest.webmanifest` | Installability, icon, Home Screen shortcuts |
| `server/server.js` | Optional. Static hosting + push reminders. Stores only push subscriptions and times |

Storage format (`localStorage["tgt.entries"]`):
```json
{ "2026-09-14": { "items": ["Coffee on the porch", "The rain stopped", "Finished the report"], "updatedAt": 1789419600000 } }
```
