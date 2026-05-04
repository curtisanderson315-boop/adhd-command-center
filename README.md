# ADHD Command Center

> An executive-function layer for ADHD brains. Capture voice thoughts, triage email
> with one tap, and route everything to Gmail / Calendar / Tasks via Claude.

**Platform:** iOS (React Native + Expo SDK 54)
**Owner:** Curtis Anderson · curtisanderson315@gmail.com
**Bundle ID:** `com.curtisanderson.adhdcommandcenter`

---

## What it does

- **Voice capture.** Hold the mic, say anything (a task, a meeting, an email you
  want to send). Claude figures out what it is, structures it, and routes it —
  drafts the email in Gmail, books the event on your Calendar, or files the
  task. Confirmation is read aloud so you don't have to look at the phone.
- **One-tap email triage.** Pulls unread mail, has Claude Haiku triage each
  message into urgent / action-needed / FYI / noise, and shows one card at a
  time with two or three concrete actions (reply with a draft, snooze, archive,
  turn into a task). Swipe left to archive, right to dismiss.
- **Tasks bucketed by horizon.** Today / Upcoming / Someday. Swipe right to
  complete, swipe left to delete. Tap `+` to quick-add. Sorted by priority then
  recency.
- **Background polling.** While the app is in your pocket, iOS background fetch
  triages new mail and pings you when something urgent lands.
- **Siri shortcuts.** "Hey Siri, log a thought" → opens Home. "Show my emails"
  → jumps to Triage.

---

## Quickstart for Curtis

After EAS finishes a development build:

1. Open the build's install link on your iPhone (you'll get a QR code on the
   Expo dashboard) and accept the prompts.
2. Open the app once so iOS lets you grant permissions.
3. Go to **Settings** in the app and:
   - Paste your Anthropic API key (from `console.anthropic.com` → API Keys),
     hit **Save**, then **Test connection** to confirm it works.
   - Tap **Connect Gmail + Calendar** and complete Google sign-in.
   - Toggle **Push notifications** on (iOS will prompt for permission).
   - Pick an auto-check interval (15m is a good default; choose **Manual** if
     you don't want background polling).
4. Add Siri shortcuts: iOS Settings → Siri & Search → ADHD Command Center →
   add phrases for "Log a thought", "Add a task", "Show my emails".

That's it. Hold the mic on the Home screen to capture a thought.

---

## Project structure

```
ADHD App/
├── App.tsx                          Root navigator, Siri + notification taps
├── index.js                         registerRootComponent entry
├── app.json                         Expo config (bundle ID, plugins, entitlements)
├── eas.json                         EAS build profiles
├── .easignore                       Files excluded from EAS uploads
│
├── src/
│   ├── types/index.ts               All shared TS types (single source)
│   ├── theme.ts                     Colors, spacing, typography tokens
│   ├── store/index.ts               Zustand store + AsyncStorage persistence
│   │
│   ├── screens/
│   │   ├── HomeScreen.tsx           Capture feed
│   │   ├── TriageScreen.tsx         Swipeable email-triage card
│   │   ├── TasksScreen.tsx          Buckets + swipe gestures + quick-add
│   │   └── SettingsScreen.tsx       Auth, API key, intervals
│   │
│   ├── components/
│   │   ├── CaptureBar.tsx           Hold-to-record mic + text fallback
│   │   └── PriorityBadge.tsx
│   │
│   └── services/
│       ├── ai.ts                    Anthropic Claude (voice + triage)
│       ├── auth.ts                  Google OAuth2 (PKCE)
│       ├── gmail.ts                 Gmail API (read inbox, draft, archive)
│       ├── calendar.ts              Google Calendar API (create event)
│       ├── siri.ts                  Siri shortcut registration + events
│       ├── background.ts            ADHD_EMAIL_POLL background-fetch task
│       └── utils.ts                 nanoid, MIME, relative time
│
└── assets/                          icon.png, splash.png, etc.
```

---

## Tech stack

| Layer          | Choice                                                        |
|----------------|---------------------------------------------------------------|
| Framework      | React Native 0.81.5 + Expo SDK 54                             |
| Language       | TypeScript (strict)                                           |
| State          | Zustand + AsyncStorage                                        |
| Navigation     | React Navigation v7 (bottom tabs)                             |
| Voice capture  | expo-av (recording) + expo-speech (TTS confirmation)          |
| Auth           | expo-auth-session (Google OAuth2 with PKCE)                   |
| Token storage  | expo-secure-store (encrypted on device)                       |
| AI             | Claude Sonnet 4.6 for voice, Claude Haiku 4.5 for triage      |
| Notifications  | expo-notifications + expo-task-manager + expo-background-fetch|
| Build          | EAS Build (cloud, no Mac required)                            |

---

## Building

### Cloud build for device (the usual)

```bash
npx --yes eas-cli build --platform ios --profile development --non-interactive
```

Use `--no-wait` if you don't want the CLI to tail logs for 20 minutes —
the build URL is printed either way.

Check recent builds:

```bash
npx --yes eas-cli build:list --platform ios --limit 5
```

Inspect a specific build (status, error, log URLs):

```bash
npx --yes eas-cli build:view <build-id> --json
```

### Local Metro dev server (for fast UI iteration)

```bash
npx expo start --tunnel
```

Add `--clear` if cache feels stale.

### Reinstall dependencies

Always use `--legacy-peer-deps` on this project — `react-native-worklets` has
a peer-dep mismatch that the flag works around:

```bash
npm install --legacy-peer-deps
```

---

## Required credentials

| What                      | Where it lives                                                   |
|---------------------------|------------------------------------------------------------------|
| Anthropic API key         | App → Settings → "AI (Claude / Anthropic)"                       |
| Google OAuth tokens       | App → Settings → "Connect Gmail + Calendar"                      |
| Google iOS Client ID      | `src/services/auth.ts` (committed; restricted by bundle ID)      |
| Apple Distribution cert   | EAS managed                                                      |
| Provisioning profile      | EAS managed (your iPhone UDID is already registered)             |

The app never sends email or modifies the calendar without an explicit tap —
all Gmail writes are saved as **drafts**, never auto-sent.

---

## Windows-specific gotchas

These are baked into how the project must be operated:

1. **`--legacy-peer-deps` is mandatory.** Plain `npm install` will fail.
2. **PowerShell `.ps1` files are ASCII-only.** No em dashes, smart quotes, or
   Unicode — use plain hyphens and straight quotes.
3. **`node_modules` is a junction** to `C:\Dev\adhd-app-node-modules` (outside
   OneDrive to avoid sync churn). Don't move or delete it.
4. **The project lives in OneDrive**, so very large file ops can be slow.
5. **Use `.bat` shims** for runnable scripts instead of long inline commands.

---

## Build troubleshooting

**Prebuild fails with `EACCES: permission denied, mkdir '.expo/web'`.**
The `.expo/` directory is being uploaded with restrictive permissions. Make
sure `.easignore` excludes `.expo/`, `node_modules/`, and `.git/`. (Already
handled in this repo — flagged here so future-you doesn't lose an hour to it.)

**Build errors with "credentials not configured".**
Re-run `npx --yes eas-cli credentials` and pick "Set up a new ad hoc
provisioning profile" — Apple's certs sometimes get out of sync with EAS.

**`expo doctor` complains about package versions.**
This is a warning, not a build failure. Run `npx expo install --check` to
review, but don't blindly upgrade — peer-dep conflicts can re-surface.

---

## Known limitations / roadmap

- **Voice transcription is currently a stub.** The recorder captures audio,
  but Anthropic has no audio-input endpoint yet. The UI falls back to a text
  field where the iOS keyboard's built-in dictation works well. The seam to
  plug in Whisper or native iOS speech is `transcribeAudio()` in
  `src/services/ai.ts`.
- **iOS background-fetch interval is a hint, not a guarantee.** iOS decides
  when to actually run the task — usually 15+ minutes between executions.
- **Siri shortcuts only work on a physical device** (not the simulator), and
  only after a development or production build is installed.

---

## Files Claude reads automatically

`CLAUDE.md` — agent persona (ARIA), project rules, and autonomous protocol.
`PROGRESS_LOG.md` — per-session log of what was built, decisions, and
blockers. Append-only.
