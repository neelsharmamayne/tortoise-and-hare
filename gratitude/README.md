# Three Good Things

A private gratitude journal that is as fast as a sticky note and as pretty as a paper one.
Three good things every evening. See them again every morning.

**Live:** once GitHub Pages is on (see below) it's at `https://neelsharmamayne.github.io/gratitude/`

## Why it feels different

- **One note, not a form.** The app opens with the cursor already in a lined note. One line per gratitude. It saves as you type. There is no save button, no fields, no "+ add".
- **Talk instead of type.** Tap the mic and speak; each session becomes a new line. If the browser's speech engine won't cooperate (it often doesn't inside iOS Home Screen apps), the button hands you straight to the keyboard's dictation key, which always works.
- **Quick capture from a shortcut.** A Siri / Action Button shortcut can dictate a gratitude into today's entry via a URL (see §3 for the one iOS caveat).
- **Mornings.** Before noon, last night's gratitudes and one line from the archive sit quietly above the note, so the day starts with them.
- **Gentle gamification.** A streak flame, a year heatmap, weekly bars, milestone badges, and the words that keep coming up.
- **Private, properly.** Everything lives on your phone. No account, no server, nothing uploaded. Set a passcode and entries are encrypted on the device (AES-256); unlock with Face ID / Touch ID. Locked means nothing is even in memory.
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

## 3. Privacy: what "only me" means here

- **Entries never leave the phone.** The site only serves the app files. GitHub, the push server, and this repo never see a word you write. Anyone who opens your URL gets an empty journal on *their* device.
- **Encrypted at rest.** Settings → Privacy → **Set a passcode**. From then on entries are stored AES-256-GCM encrypted. The key is wrapped by your passcode (PBKDF2, 150k rounds) and, if you turn it on, by a secret your phone's Face ID / Touch ID produces (WebAuthn PRF, iOS 18+). While locked nothing is decrypted or held in memory, and the app relocks after two minutes in the background.
- **No reset.** If you forget the passcode and Face ID is off, the entries cannot be recovered. Export a backup from Settings; the backup file is plain text, so store it somewhere private.
- **The repo.** Making this repository private doesn't change any of the above (only code lives here), but note GitHub Pages on a private repo needs a paid GitHub plan.

### Dictating from a shortcut (Siri / Action Button)

Shortcut **Gratitude**: **Dictate Text** → **Open URLs** `https://neelsharmamayne.github.io/gratitude/?add=` + *Dictated Text* (set the variable to URL Encoded). Assign it to the Action Button or Back Tap; "Hey Siri, Gratitude" works too.

One iOS caveat: Shortcuts opens URLs in **Safari**, and iOS keeps the Home Screen app's storage separate from Safari's. So pick one home for your journal: if you use this shortcut, keep using the journal in Safari (bookmark it); if you use the Home Screen app, the fastest capture is icon → tap the keyboard's 🎤 key, which is two taps and fully reliable. With a passcode set, the shortcut's text waits on the lock screen and is added the moment you unlock.

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
| `app.js` | Entries, streaks, morning strip, voice with fallback, insights, encrypted vault (passcode + Face ID), backup, push subscription, `?add=` quick capture |
| `sw.js` | Offline cache; push notifications; opens the right screen when a notification is tapped |
| `manifest.webmanifest` | Installability, icon, Home Screen shortcuts |
| `server/server.js` | Optional. Static hosting + push reminders. Stores only push subscriptions and times |

Storage format without a passcode (`localStorage["tgt.entries"]`); with one, the same JSON lives encrypted inside `tgt.vault`:
```json
{ "2026-09-14": { "items": ["Coffee on the porch", "The rain stopped", "Finished the report"], "updatedAt": 1789419600000 } }
```
