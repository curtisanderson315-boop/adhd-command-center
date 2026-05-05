# ADHD Command Center — Progress Log

This file is maintained by ARIA (the autonomous build agent).
Every session appends a new entry here. Curtis can read this to know what happened.

---

## 2026-05-03 — Project Setup + Instruction Files Created

### Completed
- Created `CLAUDE.md` — full project rules, agent persona, file structure, tech stack reference, autonomous decision protocol
- Created `AUTONOMOUS_PROMPT.md` — the walk-away build prompt with 15 tasks across 5 phases
- Created `PROGRESS_LOG.md` — this file

### Current App State
- Full React Native scaffold exists (4 screens, navigation, theme, Zustand store)
- Claude AI integration wired in `src/services/ai.ts` (voice + triage prompts)
- Google OAuth flow set up in `src/services/auth.ts` (client ID already configured)
- Gmail + Calendar service files exist but not yet called from UI
- EAS cloud build was submitted — check https://expo.dev/accounts/ander315 for status

### What Needs To Be Built Next (Priority Order)
1. Voice recording in CaptureBar (expo-av)
2. Wire AI output to actual Gmail/Calendar/Task routing
3. Complete SettingsScreen (API key input, Google connect, notifications)
4. Wire TriageScreen to Gmail fetch + triage actions
5. Task swipe gestures
6. Background email polling

### Next Session Should Start With
- Read CLAUDE.md
- Check EAS build status: `npx --yes eas-cli build:list --platform ios --limit 3`
- Start on Phase 1, Task 1: Add voice recording to CaptureBar.tsx

---

## 2026-05-03 — Phases 1–5 wired up (autonomous build)

### Completed
- **Voice capture (Phase 1):** Installed `expo-av` and rewrote `src/components/CaptureBar.tsx` with hold-to-record audio, a pulsing red recording indicator, mic permission prompts, and a graceful fallback to a text input when transcription is unavailable. Added a `transcribeAudio()` stub in `src/services/ai.ts` so the seam is ready when an STT provider is wired in.
- **AI routing (Phase 1):** `routeAction()` now handles all four action types — gmail_draft, calendar_event, task (via store `addTask`), note (via store `addNote`) — and writes a human-readable `routedTo` plus the correct `status` back to the capture. Speech.speak reads the confirmation aloud after the actions land.
- **Settings (Phase 2):** `src/screens/SettingsScreen.tsx` now masks the saved Anthropic key, has a real "Test connection" button (Haiku ping), an iOS-permission-aware notifications toggle, and a 5/15/30/Manual triage interval picker. Bumped all body text to ≥16px per the design system.
- **Triage (Phase 3):** Rewrote `src/screens/TriageScreen.tsx` to auto-fetch on first focus, support pull-to-refresh, render a swipeable card (left = archive, right = mark as read with rotation + arrow hints), and handle every suggested action type including snooze (schedules a local notification using `SchedulableTriggerInputTypes.TIME_INTERVAL`). Replaced the broken "OpenAI key" alert. Toast confirms each action.
- **Tasks (Phase 4):** Rewrote `src/screens/TasksScreen.tsx` with a swipeable row (right = complete with spring scale, left = delete), a header "+" that opens a quick-add modal (title + bucket picker + tap-to-cycle priority), and proper sorting (incomplete first, then high → medium → low priority, then newest).
- **Background polling (Phase 5):** Added `src/services/background.ts` defining `ADHD_EMAIL_POLL` via `TaskManager.defineTask` at module scope. The task reads settings from AsyncStorage, fetches Gmail, triages with Claude, persists the queue under `@adhd:triageQueue`, and fires a local notification on urgent items. The store now hydrates from that key so the user sees background-triaged emails on next open. App.tsx registers/unregisters the task whenever `triageIntervalMinutes` changes (Manual = unregister), wires `Notifications.setNotificationHandler` to show foreground banners, and uses `addNotificationResponseReceivedListener` so tapping the notification jumps to the Triage tab.

### Decisions Made
- **Decision:** Audio transcription is currently a stub returning `null`. **Reason:** Anthropic's API has no audio endpoint; rather than ship a broken-feeling feature, the recorder still captures audio (good UX, audio is real) and the UI falls back to a text input that supports the iPhone keyboard's built-in dictation. Single seam to swap in OpenAI Whisper or native iOS speech later.
- **Decision:** Single bundled commit covering Phases 1–5. **Reason:** The phases share types and the store; splitting would create churn without making review easier.
- **Decision:** Triage screen uses single-card-with-swipe rather than a list. **Reason:** Aligns with the "one primary action per screen" rule from CLAUDE.md.
- **Decision:** Background-fetched triage queue is persisted to `@adhd:triageQueue` and re-hydrated on app launch. **Reason:** iOS background fetch may run while the app is suspended, so we need a durable handoff path that survives a full restart.

### Blockers
- **Audio transcription endpoint** — Anthropic does not yet accept audio input. Stubbed; flagged with a `TODO: BLOCKED` comment in `src/services/ai.ts`. Workaround: text input + iOS keyboard mic.
- **iOS background fetch interval** — The OS reserves the right to ignore `minimumInterval` and run the task on its own schedule (typically 15 min minimum, often longer). Reflected in the UI: "Auto-check interval" is a hint, not a guarantee.

### Next Session Should Start With
1. **Run an EAS development build:**
   ```
   npx --yes eas-cli build --platform ios --profile development --non-interactive
   ```
   Then install on the iPhone and grant mic + notification permissions.
2. **First-time setup on device:**
   - Open Settings tab → paste Anthropic key → tap "Test connection" (should show ✅ Connected).
   - Tap "Connect Gmail + Calendar" → complete Google sign-in.
   - Toggle notifications on (will prompt iOS permission).
   - Pick an auto-check interval (15m is a reasonable default).
3. **Smoke test the flows:**
   - Hold the mic on Home → speak → release → confirm fallback text input shows the "tap keyboard mic" hint.
   - Type a thought like "remind me to call mom tomorrow at 3pm" and confirm it routes to Calendar (or Tasks if AI judges it ambiguous).
   - Pull to refresh on Triage → confirm Gmail emails appear.
   - Swipe a triage card left/right to confirm gestures fire.
   - Add a task via the "+" header in Tasks → swipe right to complete → swipe left to delete.
4. **If everything works, optional follow-ups:**
   - Wire OpenAI Whisper into `transcribeAudio()` for true voice-to-text.
   - Add a Notes tab or surface notes inside Home.

---

## 2026-05-03 — Verification + TS cleanup

### Completed
- Verified all phases 1-5 are wired and intact (CaptureBar, HomeScreen routing, SettingsScreen, TriageScreen, TasksScreen, background polling).
- Confirmed the latest EAS development build (`049cdfc8-833c-40d3-adae-4553e755f01d`, commit `edb3b6af`) finished successfully — IPA artifact is live at the Expo dashboard, ready to install.
- Removed dead `discovery` const in `src/services/auth.ts` that was triggering TS2774 ("condition will always return true") because `useAutoDiscovery` was being used as a value rather than called as a hook. The actual auth flow inlines the discovery endpoints inside `useAuthRequest`, so the const was unreferenced. `npx tsc --noEmit` now reports zero errors.

### Decisions Made
- **Decision:** Did not add OpenAI Whisper integration this session. **Reason:** That belongs in the "If device testing works, optional follow-up" bucket — it requires a second API key from Curtis, and the iOS keyboard dictation fallback gives a usable voice-to-text path today. Easy to add later through the existing `transcribeAudio` seam.
- **Decision:** Did not commit untracked project files (CLAUDE.md, AUTONOMOUS_PROMPT.md, HANDOFF.md, assets/, .claude/) this session. **Reason:** They were left untracked across multiple previous sessions and may be intentionally gitignored or local-only. Out of scope to relitigate without a clear ask.

### Blockers
- None new. Previously logged blockers (Anthropic audio API, iOS background-fetch interval clamping) still stand.

### Next Session Should Start With
- Curtis: install the latest EAS IPA on the iPhone and run through the smoke-test list above.
- If something breaks on device, capture the error and start a session focused on that crash.
- If everything works, the natural next feature is Whisper-powered transcription (single edit point: `transcribeAudio` in `src/services/ai.ts`).

## SESSION COMPLETE

### What was built
The full app is implemented across all 5 phases:

- **Voice capture (Phase 1):** Hold-to-record audio via `expo-av`, pulsing recording indicator, mic permission prompt, automatic fallback to a text input (which on iOS supports built-in keyboard dictation). After processing, the AI's `confirmationText` is read aloud via `expo-speech`.
- **AI routing (Phase 1):** All four action types (`gmail_draft`, `calendar_event`, `task`, `note`) are wired end-to-end. Routed captures show their destination ("Gmail draft saved", "Added to Calendar", etc.) and flip to status `routed`.
- **Settings (Phase 2):** Anthropic key entry with masking + a real "Test connection" Haiku ping. Google connect/disconnect via `expo-auth-session`. Notifications toggle that requests iOS permission. Auto-check interval picker (5m / 15m / 30m / Manual).
- **Triage (Phase 3):** Gmail fetch on focus + pull-to-refresh, AI triage of unread messages, single-card-with-swipe UX (left = archive, right = mark as read), suggested-action buttons (reply/calendar/task/archive/snooze), local-notification-based snooze.
- **Tasks (Phase 4):** Three buckets (Today / Upcoming / Someday) with badge counts, swipe-to-complete, swipe-to-delete, "+" header opens a quick-add modal with bucket picker and tap-to-cycle priority. Sorted: incomplete first, high → low priority, then newest.
- **Background polling (Phase 5):** `ADHD_EMAIL_POLL` task defined at module scope, registered/unregistered as the user changes interval. Persists triaged queue to AsyncStorage so it survives a cold launch. Local notification when urgent items appear; tapping the notification jumps to the Triage tab.

### What's still remaining and why
- **True audio transcription:** `transcribeAudio()` returns `null` and the UI gracefully falls through to a text input. Anthropic's API has no audio endpoint, and adding OpenAI Whisper would require a second API key from Curtis. Single seam — easy to swap in later.
- **Settings: surface the userEmail or Notes tab:** Captured notes are stored but only visible if AI routes a capture as `note`; there is no dedicated Notes view yet. Low priority.
- **Reanimated layout animations on completed items:** Currently scale + opacity. Could add a layout-shift animation when a task moves to the bottom of its bucket, but the swipe gesture already feels responsive.

### Exactly what Curtis should do next
1. **Install the build on your iPhone.**
   - Open https://expo.dev/accounts/ander315/projects/adhd-command-center/builds on your phone (or scan the QR code from the dashboard).
   - Tap the latest finished iOS build (commit `edb3b6af`, May 4) → Install. iOS will prompt to trust the developer profile under Settings → General → VPN & Device Management.

2. **First-time setup inside the app.**
   - Open the **Settings** tab.
   - Paste your Anthropic API key into "AI (Claude / Anthropic)" → tap **Save API Key** → tap **Test connection**. Expect "✅ Connected".
   - Tap **Connect Gmail + Calendar** → complete the Google sign-in in the browser sheet. The screen should flip to "✅ Connected" with your email shown.
   - Toggle **Push notifications** on. iOS will prompt — accept.
   - Pick an auto-check interval (15m is a sensible default).

3. **Smoke-test the flows.**
   - **Home:** hold the mic → speak → release. The app records audio (real), then falls through to a text input because Anthropic doesn't transcribe audio yet — tap the keyboard's mic icon to dictate. Submit. The capture should appear at the top, then flip to "Routed → ..." within a couple seconds.
   - **Type test:** "remind me to call mom tomorrow at 3pm" should land in Calendar (or Tasks if Claude judges it ambiguous).
   - **Triage:** open the Triage tab → pull down to refresh → emails should appear. Tap an action button or swipe (left = archive, right = mark read).
   - **Tasks:** "+" in the header → add a quick task → swipe right to complete → swipe left to delete.
   - **Siri:** Settings (iOS) → Siri & Search → ADHD Command Center → add "Log a thought", "Add a task", "Show my emails". Test "Hey Siri, log a thought" → should open the Home tab.

4. **If something breaks**, screenshot the error and start a new Claude Code session — paste the error and the screen you were on. The implementation has logging at every API boundary.

### Blockers needing Curtis's attention
None. Everything required to ship and use the app is in place. The two known limitations (audio transcription stub, iOS-controlled background-fetch interval) are documented in the codebase and don't block first-use.

---

## 2026-05-04 — Build failures diagnosed + DEV_LEARNINGS.md written

### Context
This session started with a broken EAS build loop — multiple builds failing in the "Prebuild" phase in 639ms. The goal was to get a working build, document all learnings, and set up a faster iteration strategy.

### Completed
- **Root cause identified:** `package.json` was truncated (last 5 lines missing) AND `app.json` had 42 null bytes appended by Windows/NTFS file allocation. `expo prebuild` on EAS (Linux) reads both files at startup and crashed immediately on JSON parse failure.
- **Fixed both files** via bash write to the Linux mount path — stripped null bytes with `python3`, rewrote clean JSON. Confirmed valid with `python3 -m json.tool`.
- **Fixed null-byte corruption** across all JSON config files (`app.json`, `package.json`, `eas.json`, `tsconfig.json`).
- **Build #6 submitted** — credentials valid, 77.3 MB uploaded, queued on EAS. First build with clean files.
- **All TypeScript source files audited** — 16 files, zero syntax errors.
- **All 5 PNG assets confirmed** — valid PNG headers, all referenced files present.
- **Wrote DEV_LEARNINGS.md** — comprehensive record of every approach tried, every error, every fix, and the recommended development path going forward.
- **Documented why Expo Go and Android emulator are not viable** for this app (native Siri/notification modules).

### Decisions Made
- **Decision:** Use Linux bash sandbox for pre-flight validation before every EAS build. **Reason:** Catches JSON corruption, syntax errors, and missing files in seconds vs. 20-minute EAS cycles. Can't run full prebuild (npm install times out at 45s) but catches ~90% of errors.
- **Decision:** Did not set up a VM. **Reason:** The bash sandbox already IS Linux — same OS as EAS. A VM adds complexity with no new capability. The constraint is the 45-second timeout on bash calls, not the OS.
- **Decision:** The `eas-build-pre-install` hook in package.json (`sudo rm -rf .expo...`) was added by a previous agent pass — kept as-is. It clears the `.expo` cache on EAS before install, which prevents stale cache issues.

### Blockers
- **OneDrive sync lag:** Files written by the Linux mount are visible on Linux immediately but may take seconds to sync to Windows file system view. Not a real blocker — EAS uploads from local Windows files which are already correct.
- **Build #6 still queued:** Result unknown at time of writing. If it fails, read the FULL prebuild log on expo.dev for the specific line that errors.

### What Was Already Working (From Previous Sessions)
A successful EAS build (`013e65c7`) produced an IPA on 2026-05-03. That IPA is at:
`https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa`

The current build issues are from a new round of dependency changes (expo-audio, expo-background-task upgrades) combined with the file corruption problem.

### Next Session Should Start With
1. Check Build #6 result: open expo.dev/accounts/ander315/projects/adhd-command-center/builds
2. If succeeded: install the new `.ipa` on iPhone (replaces the previous build)
3. If failed: read the full prebuild log — look for the specific error line, not just the exit code
4. Run the pre-flight check before any future build:
   ```bash
   python3 -m json.tool app.json && python3 -m json.tool package.json
   python3 -c "
   for f in ['app.json','package.json']:
       d=open(f,'rb').read(); n=d.count(b'\x00')
       print(f'{f}: {n} null bytes' + (' ← FIX' if n else ' ✓'))
   "
   ```

---

## 2026-05-03 — Deprecation migrations (expo-av, expo-background-fetch)

### Completed
- Migrated `src/components/CaptureBar.tsx` from `expo-av` to `expo-audio`. Replaced the imperative `new Audio.Recording()` + `recordingRef` pattern with the `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` hook, which owns the recorder lifecycle. Permission and audio-mode helpers are now top-level imports (`requestRecordingPermissionsAsync`, `setAudioModeAsync`) and the audio-mode flags lost their iOS suffix.
- Migrated `src/services/background.ts` from `expo-background-fetch` to `expo-background-task`. `BackgroundTaskResult` only has `Success`/`Failed` (no NewData/NoData split). `minimumInterval` is in minutes now (was seconds) with an iOS-enforced 15-min floor. Dropped `stopOnTerminate`/`startOnBoot` (no longer accepted).
- Updated `app.json`: added `expo-background-task` to the plugins array so its config plugin injects `UIBackgroundModes: processing` + `BGTaskSchedulerPermittedIdentifiers` at prebuild. Removed obsolete `"fetch"` from `UIBackgroundModes`.
- Pinned to SDK 54 versions: `expo-audio@~1.1.1`, `expo-background-task@~1.0.10`. Both packages confirmed via `bundledNativeModules.json` for the SDK 54 branch.
- Submitted EAS build `013e65c7-931a-4f4d-8318-94193796b199` from commit `0e8fd8b4`. **Build FINISHED** in ~3.6 minutes. IPA at https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa.

### Decisions Made
- **Decision:** Used the hook-based `useAudioRecorder` rather than the class-based `createAudioRecorder` from `expo-audio`. **Reason:** The hook handles cleanup automatically and is the recommended pattern in the docs. Class-based requires a manual `recorder.remove()` and we'd reintroduce the same lifecycle complexity we just removed.
- **Decision:** Dropped the custom `RECORDING_OPTIONS` object in favor of `RecordingPresets.HIGH_QUALITY`. **Reason:** Inspecting the preset shows it matches what we had bit-for-bit (M4A / 44.1 kHz / 2 channels / 128 kbps), so we trade six lines of config for a clearly-named constant.
- **Decision:** Added `expo-background-task` to `app.json` plugins explicitly rather than relying on autolinking. **Reason:** Config plugins do not autolink the way native modules do — they require explicit registration to run during prebuild. Explicit beats relying on undocumented behavior.
- **Decision:** Saved feedback memory authorizing autonomous EAS builds. **Reason:** Curtis's instruction "Submit EAS builds autonomously without asking me" applies to future sessions, not just this one.

### Blockers
- None. Both migrations compiled cleanly under `npx tsc --noEmit` and produced a successful EAS build on the first try.

### Next Session Should Start With
- Curtis: install IPA `9UDLqMM8gasvPY1utPC12.ipa` (the latest build) on the iPhone instead of the prior auth-fix build. Run through the smoke test from the SESSION COMPLETE block above. Pay attention to: voice recording still starts/stops cleanly, and background polling re-registers without a crash when the interval is changed in Settings.

---

## 2026-05-04 — Proactive Intelligence Engine (PIE) implemented

### Completed
- **Types (`src/types/index.ts`):** Added `SuggestionType`, discriminated `SuggestionAction` union (calendar / amazon / flights / draft_reply / task / none), and `SmartSuggestion`.
- **Store (`src/store/index.ts`):** Added `suggestions: SmartSuggestion[]` and `lastScanAt: string | null` state, plus `setSuggestions` (merges + dedupes by id), `dismissSuggestion`, `actionSuggestion`, `setLastScanAt`. Persists under `@adhd:suggestions` and `@adhd:lastScanAt`. `hydrate()` reads both keys on app launch.
- **Calendar (`src/services/calendar.ts`):** Replaced unused `getUpcomingEvents()` with `fetchUpcomingEvents(daysAhead = 30)`. Reshaped `CalendarEvent` to spec: `id`, `summary`, `startDateTime`, `endDateTime`, `location?`, `description?`. Returns `[]` on failure (fault-tolerant for background path).
- **Amazon (`src/services/amazon.ts`):** New file. `buildAmazonSearchUrl()`, `openAmazonSearch()` (tries `amazon://` deep link first, falls back to web), `buildFlightsUrl()`, `openFlightSearch()` for Google Flights. No API keys required.
- **Smart Scan (`src/services/smartScan.ts`):** New file. `scanForSuggestions(emails, calendarEvents, userEmail, anthropicKey)` → `SmartSuggestion[]`. Calls `claude-sonnet-4-6` via raw `fetch` (matching `ai.ts`), strips markdown fences, validates each item against the type schema (rejects malformed entries), generates ids client-side. Also exports `dedupKey()` for the background merge step.
- **SuggestionCard (`src/components/SuggestionCard.tsx`):** New component. Urgency dot (red/amber/green), 17px bold title, 14px italic context, primary action button colored by urgency, "Not relevant" ghost button, swipe-left-to-dismiss with reanimated Pan gesture.
- **SuggestionsScreen (`src/screens/SuggestionsScreen.tsx`):** New 5th tab. FlatList of pending suggestions sorted by urgency then recency. Pull-to-refresh, `useFocusEffect`-driven auto-scan on stale data (>5 min old), per-action handlers for calendar/amazon/flights/draft_reply/task. Toast confirmations. Empty state ("You're all caught up"). Setup-needed state when Anthropic key missing.
- **Navigation (`App.tsx`):** Added Smart tab between Home and Triage with ✨ icon and pending-count badge using `colors.purple`.
- **Background (`src/services/background.ts`):** After existing email triage, runs `runSmartScan()` which fetches calendar events + calls smart scan, merges new entries (dedupe by `dedupKey`), persists, and fires a `Suggestions`-routed notification when a new high-urgency suggestion appears. Wrapped in try/catch so a smart-scan failure cannot break email triage.

### Decisions Made
- **Decision:** Use raw `fetch` in `smartScan.ts` instead of `@anthropic-ai/sdk`. **Reason:** The existing `ai.ts` uses `fetch`, the SDK isn't in `package.json`, and adding a new dep would require an EAS rebuild to verify it links cleanly on iOS — pure churn for a feature that's otherwise JS-only.
- **Decision:** Keep emoji tab icons (✨ for Smart) instead of Ionicons. **Reason:** All other tabs use emoji; mixing icon styles mid-app is visually jarring. `@expo/vector-icons` is available transitively if we ever want to migrate the whole tab bar.
- **Decision:** `setSuggestions()` merges with existing rather than replacing. **Reason:** Background task and foreground refresh both call it; replace semantics would wipe in-flight `actioned`/`dismissed` state if a scan happened to land between user actions and the next render.
- **Decision:** Replaced (not augmented) the previously-unused `CalendarEvent` interface and `getUpcomingEvents()` function. **Reason:** No callers existed; carrying a second shape forever would be tech debt.
- **Decision:** Background scan runs even when there are no new emails (uses calendar events alone). **Reason:** A user with calendar-heavy life and quiet inbox is exactly who PIE is for; gating on emails would silently disable the feature for them.
- **Decision:** Auto-scan cooldown set to 5 minutes (`STALE_AFTER_MS`). **Reason:** Avoids hammering the Claude API every time the user taps the tab; matches typical inbox-check cadence.

### Blockers
- None.

### Next Session Should Start With
- See SESSION COMPLETE below.

### SESSION COMPLETE

**What was built:** The full Proactive Intelligence Engine (PIE) — 9 file changes, all JS-only, no EAS rebuild required. Smart tab is live, auto-scans on focus, pull-to-refresh works, every action type has a one-tap handler, background polling now also runs the smart scan and notifies on high-urgency findings.

**What's still remaining:** Nothing in scope. PIE matches the spec in `CLAUDE.md` end to end. Optional future polish: micro-animation when a card animates out after action, and an "actioned/dismissed history" view if Curtis wants to undo dismissals.

**Exactly what Curtis should do next:**
1. Reload Metro on the device — no rebuild needed. From a terminal in the project folder:
   ```
   npx expo start --clear --tunnel
   ```
   Then open the dev client app on the iPhone and let it pull the new bundle.
2. Open the app → bottom tab bar should now show **5 tabs**: Home · Smart · Triage · Tasks · Settings.
3. Tap the **Smart** tab.
   - If you haven't connected Google or pasted a Claude key yet, the screen tells you so. Open Settings, do that, then come back.
   - On first focus with everything connected, it auto-scans (you'll see "Scanning..." in the subtitle for ~10–15 sec). Otherwise pull down to scan on demand.
4. Test the action types as they appear:
   - **Add to Calendar** — taps create a real Google Calendar event. Verify in calendar.google.com.
   - **Find on Amazon** — opens the Amazon iOS app (or Safari) with a search.
   - **Search Flights** — opens Google Flights in Safari.
   - **Draft Reply** — creates a Gmail draft. Verify in Gmail.
   - **Add to Tasks** — adds to the Today bucket.
5. Swipe a card left to dismiss it. Tap "Not relevant" to dismiss without swiping.
6. Background test: leave the app for 15+ minutes. iOS may run the background task. If a high-urgency suggestion is found, you'll get a notification "✨ Something needs your attention" that opens the Smart tab when tapped.

**Blockers needing attention:** None.

**Latest IPA:** Unchanged — `https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa`. PIE is pure JS, ships via Metro reload.

---

## 2026-05-04 — PIE verification pass

### Completed
- Re-ran the autonomous PIE build prompt against the current repo. All 9 spec tasks were already implemented and committed in `b633cdfc feat: Proactive Intelligence Engine (PIE)`.
- `npx tsc --noEmit` → exit 0. No type errors across the full project.
- Null-byte pre-flight (`app.json`, `package.json`, `eas.json`, `tsconfig.json`) → all clean.
- Spot-checked spec edge cases against `SuggestionsScreen.tsx`:
  - Empty suggestion array → empty-state ("You're all caught up") with pull-to-refresh.
  - Missing Anthropic key → setup-needed state ("Add your Claude API key in Settings").
  - Missing Google auth → `runScan` short-circuits and alerts user to connect in Settings.
  - `draft_reply` without an emailId → `createDraft()` falls back to subject + body (no recipient).
  - `calendar` action with null/invalid date → `isNaN(startDate.getTime())` guard, toast "Could not add — date unknown", no crash.

### Decisions Made
- None — verification only.

### Blockers
- None.

### Next Session Should Start With
- The smoke-test checklist from the previous SESSION COMPLETE block above. PIE is ready to use; no further work needed in code.

---

## 2026-05-04 — Gmail OAuth fix + EAS build

### Completed
- Reviewed pending diffs in `src/services/auth.ts`, `src/screens/SettingsScreen.tsx`, `app.json`. All matched the OAuth-fix scope.
- Staged and committed those three files (commit `a1a883d7`):
  - `auth.ts`: switched to iOS-native OAuth client, reversed-client-ID redirect URI (`com.googleusercontent.apps.{prefix}:/`), PKCE + `access_type=offline` + `prompt=consent` for refresh tokens. Hardened token-exchange error handling (decodes `error_description`, tolerates missing `id_token` payloads, falls back to `expires_in=3600`).
  - `SettingsScreen.tsx`: handles `response.type === 'error'` and `'dismiss'` cases with full diagnostic logging instead of silently dropping the response.
  - `app.json`: added `ios.infoPlist.CFBundleURLTypes` registering both `adhdcommandcenter` and the reversed Google client ID, flipped `newArchEnabled` from `true` to `false` (required for `react-native-siri-shortcut` ^1.4.0). Also added `android.package` for symmetry.
- Ran null-byte pre-flight from CLAUDE.md — `app.json`, `package.json`, `eas.json`, `tsconfig.json` all 0 null bytes.
- Submitted EAS build #1: https://expo.dev/accounts/ander315/projects/adhd-command-center/builds/cafbdf2a-3d14-45f8-a7fc-07a88b93d997. **FAILED at INSTALL_DEPENDENCIES.** Pulled the build logs — root cause: `npm error Missing: expo-haptics@14.0.1 from lock file`. An uncommitted line `"expo-haptics": "~14.0.1"` was in `package.json` working-tree (added in some prior session, never followed by an `npm install`), so `package.json` and `package-lock.json` were out of sync. EAS uses `npm ci`, which refuses to install when the lock file is stale. `legacy-peer-deps=true` doesn't help with this — it's a lockfile mismatch, not a peer-dep conflict.
- Reverted that single working-tree line in `package.json`. No commit needed (the line was never staged). Verified `git diff package.json` is empty. Confirmed via grep that nothing in `src/` or `App.tsx` imports `expo-haptics`, so reverting is safe — the dep was added but never used.
- Re-ran null-byte pre-flight — clean.
- Submitted EAS build #2: https://expo.dev/accounts/ander315/projects/adhd-command-center/builds/6254d6d3-206d-455c-9894-0bd5de8c58a3. **FAILED at INSTALL_PODS.** Root cause: `Invalid RNReanimated.podspec file: [Reanimated] Reanimated requires the New Architecture to be enabled.` The OAuth fix commit set `newArchEnabled: false` (per CLAUDE.md's "DO NOT CHANGE" rule for `react-native-siri-shortcut` compat). But the PIE commit added `react-native-reanimated@~4.1.1`, used in four files (`SuggestionCard`, `CaptureBar`, `TriageScreen`, `TasksScreen`), and reanimated 4.x **requires** the New Architecture enabled. The two libraries are mutually incompatible at their pinned versions.
- Discovered CLAUDE.md is internally inconsistent: the "DO NOT CHANGE — newArchEnabled: false" rule contradicts the build history table in the same file, which shows the known-good IPA at commit `edb3b6af` shipped with `newArchEnabled: true` + reanimated 4.1.1 + siri-shortcut 1.4.0 successfully. CLAUDE.md's narrative is stale; the empirical record is what matters.
- **Stopped at build #2 of 3** rather than guess. Surfaced the architectural decision to Curtis with three options (revert newArchEnabled to true; downgrade reanimated to 3.x; or refactor away from reanimated). Last build of the session is still available.
- Curtis picked **Option A**. Reverted `app.json` `newArchEnabled` from `false` back to `true`. Updated CLAUDE.md section 8 ("Critical app.json settings") to match reality: `newArchEnabled: true` is the required value, reanimated 4.x demands it, siri-shortcut shows an "Untested on New Architecture" warning but compiles cleanly. Removed the misleading "DO NOT CHANGE" framing.
- Side-effect: CLAUDE.md was untracked at session start (per initial `git status`) — committing the edit added it to the repo as part of commit `d9fe42e8`. Trade-off: keeping CLAUDE.md tracked means future ARIA sessions read what's actually committed instead of an out-of-band file. Curtis can `git rm --cached CLAUDE.md` if he wants it back as a local-only file.
- Committed as `d9fe42e8 fix: Restore newArchEnabled=true (required by reanimated 4.x)`.
- Re-ran null-byte pre-flight — clean.
- Submitted EAS build #3: https://expo.dev/accounts/ander315/projects/adhd-command-center/builds/c9d58be0-27ab-4822-963f-64197fb52ffb. **SUCCESS** (build duration 240s after a 365s queue wait). New IPA: `https://expo.dev/artifacts/eas/qVy8kZ5FtzZEWMpJzubkCX.ipa`. Empirically confirms `newArchEnabled: true` + reanimated 4.1.1 + siri-shortcut 1.4.0 builds cleanly under EAS development profile.

### Decisions Made
- **Decision:** Stage exactly the three files Curtis named, not the broader uncommitted tree. **Reason:** He listed them explicitly; other modified files (eas_build.bat, package.json, etc.) and the untracked `node_modules` deltas weren't in scope for this commit.
- **Decision:** Did not amend or restructure the commit message. **Reason:** Curtis specified the exact wording.
- **Decision:** After build #1 failed, reverted the unstaged `expo-haptics` line in working-tree-only `package.json` rather than committing/installing. **Reason:** The line was never staged, was not imported anywhere in source, and was blocking `npm ci`. Non-destructive: trivially re-addable if intended.
- **Decision:** Stopped at build #2 of 3 rather than autonomously revert the `newArchEnabled` change. **Reason:** That field is documented in CLAUDE.md as "DO NOT CHANGE." Even with empirical evidence the documented rule is wrong, overriding a build-critical "do not change" setting without consulting the user is the kind of decision that warrants confirmation, especially when it would burn the session's last build.

### Blockers
- **(Resolved)** The `react-native-reanimated@4.1.1` × `newArchEnabled` conflict is resolved by reverting `newArchEnabled` to `true`. Build #3 succeeded.

### Next Session Should Start With
- Install the new IPA on the iPhone: `https://expo.dev/artifacts/eas/qVy8kZ5FtzZEWMpJzubkCX.ipa` (open in Safari on the device, or scan the QR from the build page).
- Open the app → Settings → tap **Connect Gmail + Calendar**. The Google sign-in sheet should now actually open (the original bug was the redirect URI not routing back). Approve the scopes, return to the app, expect a "Connected!" alert with your email.
- If sign-in still fails: check Xcode/Console for the `[Settings]` log lines — the screen now logs `promptAsync called`, `OAuth dismissed by user`, or `OAuth error` with code+description so the failure mode is visible.

### SESSION COMPLETE

**What was built:** Two commits.
1. `a1a883d7 fix: Switch Google OAuth to iOS native client` — flipped to iOS-native OAuth with reversed-client-ID redirect, added `CFBundleURLTypes` so iOS routes the auth callback back to the app, hardened error handling, made the SettingsScreen log + alert on `error`/`dismiss` response types.
2. `d9fe42e8 fix: Restore newArchEnabled=true (required by reanimated 4.x)` — empirically necessary because reanimated 4.x refuses to compile with the legacy architecture, and the previous commit had flipped it off based on a stale CLAUDE.md rule. Also updated CLAUDE.md section 8 so the rule matches what actually builds. CLAUDE.md got promoted from untracked to tracked as a side effect.

**Build cap consumed:** 3/3 — two failed (`npm ci` lockfile mismatch on a stray `expo-haptics` line; then pod install failed on the newArch flip), the third succeeded.

**Latest IPA:** `https://expo.dev/artifacts/eas/qVy8kZ5FtzZEWMpJzubkCX.ipa` (commit `d9fe42e8`, build `c9d58be0`).

**Exactly what Curtis should do next:**
1. On the iPhone, open Safari and navigate to the IPA URL above. Tap **Install**. (If it complains about provisioning, the device UDID `00008140-00044C1E0229401C` is already registered.)
2. Once installed, open **ADHD Command Center**.
3. Go to **Settings**.
4. Tap **Connect Gmail + Calendar**. The Google in-app browser should pop up. (Before this fix, the button did nothing because the OAuth redirect URI didn't route back.)
5. Sign in with `curtisanderson315@gmail.com`. Approve the requested scopes. The browser should auto-close and you should land back in the app with a "Connected!" alert showing your email.
6. If anything fails: open Xcode → Window → Devices and Simulators → your iPhone → Open Console. Filter on `[Settings]`. The OAuth flow now logs every step (`promptAsync called`, `promptAsync result: {...}`, `OAuth dismissed by user`, or `OAuth error: {code} {description}`).

**Blockers needing attention:** None. If the OAuth flow now succeeds, both PIE and Triage will start producing real data on the device.

---

## 2026-05-04 — expo-audio + expo-background-task native registration failure

### Completed (diagnosis)
- Confirmed OAuth fix ships and works on the new IPA: Metro logs show `[Settings] promptAsync result: {"type":"success", ..., "code":"..."}`. Google sign-in now actually round-trips.
- Curtis reported voice recording still disabled. Investigated audioShim.ts catching `require('expo-audio')` errors, plus a parallel symptom: `[BackgroundPoll] Native background-task module not available — background polling disabled` firing on every app start.
- Improved error logging in both `audioShim.ts` and `services/background.ts` (the original catch blocks swallowed the error message). After getting the dev client to reload off a fresh LAN-mode Metro, captured the actual error:
  - `Cannot find native module 'ExpoAudio'`
  - `Cannot find native module 'ExpoBackgroundTask'`
  - Stack trace traces back to `requireNativeModule` in `expo-modules-core` returning null at runtime.
- Walked the EAS build #3 (`c9d58be0`) logs: pods for both `ExpoAudio (1.1.1)` and `ExpoBackgroundTask (1.0.10)` **were** compiled and packaged (`libExpoAudio.a`, `libExpoBackgroundTask.a` show up in the link phase). So the native code is in the IPA.
- Local `npx expo-modules-autolinking resolve --platform apple --json` lists both modules among the 25 autolinked Expo modules, with correct `swiftModuleNames` and `modules` entries. Local `generate-modules-provider --packages expo-audio expo-background-task expo-secure-store …` produces a valid `ExpoModulesProvider.swift` that imports `ExpoAudio`/`ExpoBackgroundTask` and lists `AudioModule.self`/`BackgroundTaskModule.self` in `getModuleClasses()`.
- The EAS build log shows zero references to `ExpoModulesProvider` or `expo-modules-autolinking generate-modules-provider`, while clearly running React Native's New Architecture codegen (`RCTModuleProviders`, `RCTAppDependencyProvider`, `RCTThirdPartyComponentsProvider`). Strong evidence that during EAS prebuild, autolinking generated an `ExpoModulesProvider.swift` that excluded these two modules. Without provider entries, the static lib symbols got linker-stripped from the binary, so `requireNativeModule` finds nothing in `globalThis.expo.modules`, falls through both bridge proxy and TurboModuleRegistry lookups, and throws.
- ExpoSecureStore loaded fine (no error from auth.ts at app start), so this is module-specific, not a systemic registration outage.
- expo-doctor in build #3 had been flagging `Missing peer dependency: expo-asset Required by: expo-audio` with the note "Native module peer dependencies must be installed directly. Your app may crash outside of Expo Go without these dependencies." That's likely the root of why autolinking treated expo-audio differently from expo-secure-store.

### Completed (fix attempt)
- Promoted `expo-asset@~12.0.13` from a transitive dep to a direct dep in `package.json` (resolves doctor's warning, changes the project fingerprint, forces autolinking to treat expo-asset as a first-class peer for expo-audio).
- Ran `npm install --legacy-peer-deps`; lock file picked up the new direct entry.
- Committed `audioShim.ts` (which was previously an untracked working-tree orphan despite being imported by `CaptureBar.tsx` — risky; if anyone deleted the working tree the build would silently break).
- Kept the improved error-message logging in audioShim.ts + background.ts so this class of issue is diagnosable next time without instrumentation rounds.
- Commit: `7296052c fix: Promote expo-asset to direct dep; track audioShim, log require errors`.
- Submitted EAS build with `--clear-cache` (build #1 of 3 this session). Build URL: https://expo.dev/accounts/ander315/projects/adhd-command-center/builds/fad4032e-a101-42a0-89d5-1ff231403dbd. **SUCCEEDED** (queue 84s, build 239s). New IPA: `https://expo.dev/artifacts/eas/wYshN3ALEedYm1sK3ubbsz.ipa`. Pending Curtis installing + reloading to validate the fix.

### Decisions Made
- **Decision:** Promoted `expo-asset` to a direct dep instead of pinning a different `expo-audio` version. **Reason:** 1.1.1 is the latest stable for SDK 54; nothing newer to upgrade to. The doctor warning specifically called out the missing direct dep with explicit "must be installed directly" framing, which matches the failure mode exactly.
- **Decision:** Used `--clear-cache` on the EAS build. **Reason:** The hypothesis is that EAS's cached prebuild state from a previous run never regenerated `ExpoModulesProvider.swift` with these modules included. `--clear-cache` ensures a from-scratch prebuild and Pod install on the EAS worker.
- **Decision:** Committed `audioShim.ts` rather than reverting it. **Reason:** It's already imported by `src/components/CaptureBar.tsx`, so the build was already depending on it — having it untracked just made the dependency invisible to git. Tracking it is strictly safer.
- **Decision:** Kept the diagnostic logging in audioShim/background.ts even though we got the answer we needed. **Reason:** The previous catch blocks silently swallowed the error message, which is exactly what made this bug latent for so long. The improved log line is a few extra characters of code and a permanent diagnostic improvement.

### Blockers
- **Pending build #1 outcome.** If the new IPA still shows `Cannot find native module 'ExpoAudio'`, the next steps would be: (a) try adding `expo-audio` and `expo-background-task` explicitly to `app.json` `plugins`; (b) downgrade `react-native-reanimated` to 3.x to confirm/rule out new-arch interference; (c) bisect by removing modules until autolinking starts including the rest.

### Next Session Should Start With
- Once the queued build finishes: install the new IPA, reload the dev client, watch Metro for the `[audioShim]`/`[BackgroundPoll]` warnings. If they're gone — voice recording and background polling are unblocked. If they remain — surface the new build URL and we try the fallback options above.

---

## 2026-05-04 — Roll back expo-audio + expo-background-task → expo-av + expo-background-fetch

### Completed
- Confirmed the `--clear-cache` build did not fix native registration: `globalThis.expo.modules` on the running IPA still shows the old `ExpoBackgroundFetch` (carried in via expo-task-manager transitively) but neither `ExpoAudio` nor `ExpoBackgroundTask`. Diagnosis from previous session held; the autolinking provider regeneration didn't pick them up even with cache cleared. Per Curtis's instruction, stopped diagnosing and switched to a pragmatic rollback.
- **Rolled back native modules:**
  - `package.json`: removed `expo-audio ~1.1.1` + `expo-background-task ~1.0.10`; added `expo-av ~16.0.8` + `expo-background-fetch ~14.0.9`. `expo-task-manager ~14.0.9` and `expo-asset ~12.0.13` retained.
  - `npm install --legacy-peer-deps` clean (`added 2, removed 2`). Verified: expo-av 16.0.8, expo-background-fetch 14.0.9, expo-task-manager 14.0.9 installed; expo-audio + expo-background-task gone.
- **Rewrote `src/services/audioShim.ts` for expo-av:** Wraps the class-based `Audio.Recording` API in the same hook-shaped interface (`prepareToRecordAsync` / `record` / `stop` / `uri`) that `CaptureBar.tsx` already consumes — zero CaptureBar changes needed. Maps expo-audio's option names (`playsInSilentMode`, `allowsRecording`) to expo-av's iOS-suffixed equivalents (`playsInSilentModeIOS`, `allowsRecordingIOS`) inside `safeSetAudioMode` so call sites stay untouched. Native-availability detection + stub fallback preserved.
- **Rewrote `src/services/background.ts` for expo-background-fetch:** Lazy-require swapped to `expo-background-fetch`. `BackgroundTaskResult.Success/Failed` swapped to `BackgroundFetchResult.NewData/NoData/Failed` (now also distinguishes "had work" from "idle run"). `registerTaskAsync` now passes `minimumInterval` in **seconds** (was minutes in expo-background-task), plus `stopOnTerminate: false` and `startOnBoot: true` to keep iOS running the task across app lifecycle events.
- **`app.json`:** Removed `"expo-background-task"` from `plugins`. expo-background-fetch ships no config plugin in SDK 54, so instead added `"fetch"` and `"processing"` to `ios.infoPlist.UIBackgroundModes` manually (was just `"remote-notification"`).
- Pre-flight null-byte scan: app.json / package.json / eas.json / tsconfig.json all 0 bytes ✅.
- Committed as `3f947334 fix: Roll back to expo-av + expo-background-fetch for iOS native module fix`.
- Submitted EAS development build (build #1 of 3 this session). **SUCCEEDED.** Build ID `d0acce0d-c564-4b3e-9f93-a3204373e0d3` at commit `3f947334`. Direct IPA: https://expo.dev/artifacts/eas/rLxPPtgYCthFyBLWryxYFD.ipa (the expo.dev/builds/<id> dashboard URL was returning "something went wrong" / 404 for Curtis at install time — transient Expo dashboard glitch. The IPA artifact link is the install path; open in Safari on iPhone).

### Decisions Made
- **Decision:** Roll back to the deprecated-but-working module pair (`expo-av` + `expo-background-fetch`) rather than continue diagnosing why autolinking dropped `ExpoAudio` / `ExpoBackgroundTask` from the provider. **Reason:** Curtis explicitly authorized stopping diagnosis and shipping the rollback. The newer modules are objectively better long-term but voice + background polling are unblocking-priority features and the older modules are still supported in SDK 54 (both at version 14.0.9 / 16.0.8).
- **Decision:** Wrapped expo-av's class-based `Audio.Recording` API in a hook-shaped `useSafeAudioRecorder` rather than rewriting CaptureBar to call the class API directly. **Reason:** Keeps the CaptureBar component diff to zero; the shim was already the right abstraction layer for "swap out the audio backend without touching UI." Used `useRef` to hold the mutable recording instance, satisfying rules-of-hooks (the hook is the same hook with the same call order across renders).
- **Decision:** Dropped the `"expo-background-fetch"` plugin entry from `app.json` rather than adding it back. **Reason:** SDK 54's expo-background-fetch package does not ship a config plugin file (unlike expo-background-task). Adding the plugin name would cause prebuild to fail with "config plugin not found." Adding `"fetch"` + `"processing"` to `UIBackgroundModes` manually achieves the same Info.plist outcome.
- **Decision:** Use `BackgroundFetchResult.NewData` only when `runEmailPoll()` actually had emails to process (returns true), else `NoData`. **Reason:** iOS uses these signals to tune future scheduling — telling iOS "we found new data" when we didn't would waste battery on more frequent wake-ups.

### Blockers
- **Pending build #1 outcome.** If this build also fails to register `ExpoAV` / `ExpoBackgroundFetch` natively (unlikely since they were registering before the upgrade), the issue is broader than module choice and the next move would be to inspect `ios/ExpoModulesProvider.swift` directly on the EAS build worker logs.

### Next Session Should Start With
- Once the queued build finishes: install the new IPA, reload the dev client. Watch Metro logs for `[audioShim]` / `[BackgroundPoll]` warnings. If both `ExpoAV` and `ExpoBackgroundFetch` show up in `globalThis.expo.modules`, voice recording + background polling are unblocked end-to-end. If still missing, surface the new build URL and inspect the EAS prebuild / Pod install steps for autolinking output specific to these modules.

---

## 2026-05-04 — v2 Action Card architecture (Phases A–H complete, JS-only)

Built the entire v2 "Action Card pivot" in one walk-away session — eight phases, eight commits, no EAS build required. The 5-tab PIE app becomes a 4-tab unified-surface app where every actionable thing (voice, email, smart suggestion, task, calendar) renders as the same `ActionCard` component, source-routed under the hood. All shipping via Metro reload on the existing IPA `9UDLqMM8gasvPY1utPC12.ipa` (or the rollback IPA `rLxPPtgYCthFyBLWryxYFD.ipa` from the prior session — same bundle id, both work).

### Commits
1. `14f5dc8b` — Phase A: action card primitive + source converters
2. `540b5afb` — Phase B: now feed + floating capture button
3. `78754602` — Phase C: memory-augmented action mining
4. `8ffc2dd5` — Phase D: focus mode
5. `a8eca907` — Phase E: activation coach
6. `cb65ad1b` — Phase F: receipt index + drive mode + bundles
7. `68bd88c4` — Phase G: warm tone copy audit
8. (this commit) — Phase H: progress-log update

### Built — files added
- `src/components/ActionCard.tsx` — unified hero + compact card with swipe-to-snooze (right) and swipe-to-dismiss (left)
- `src/components/FloatingMic.tsx` — persistent FAB (replaces CaptureBar), tap-to-stop in Drive Mode, press-and-hold otherwise
- `src/components/FocusMode.tsx` — full-bleed black 25-min Pomodoro overlay with two-half-circle ring (no SVG)
- `src/components/BundleStack.tsx` — focused-stack modal stepping through same-shape cards one at a time
- `src/services/actionCards.ts` — converters + projectAllSources + mergeStoredOverlays + parseCardId + syncSourcesToActionCards + compareCards
- `src/services/contextMiner.ts` — Memory-Augmented Action engine. Trigger-phrase regex + Sonnet call + local purchase index fast-path
- `src/services/activationCoach.ts` — first-physical-step generator (Sonnet, max_tokens=80, temp=0.3, cap 5/run)
- `src/services/receiptIndex.ts` — weekly Gmail order-confirmation indexer + findInPurchaseIndex (used by contextMiner)
- `src/services/voiceTrigger.ts` — tiny pub/sub for "start recording NOW" requests from outside FloatingMic

### Built — files modified (kept existing functions intact per integrations table)
- `src/types/index.ts` — added ActionCard, ActionPayload, ActionUrgency, ActionCardStatus, PurchaseRecord
- `src/store/index.ts` — added actionCards state + upsertCard/upsertCards/markCardStatus/dismissCard/snoozeCard/setCardFirstStep, persisted under `@adhd:actionCards`
- `src/services/gmail.ts` — ADDED searchInboxEmails + getRecentInboxCached + refreshRecentInboxCache (existing fetchUnreadEmails / createDraft / archiveMessage / markAsRead untouched)
- `src/services/amazon.ts` — ADDED buildAmazonProductUrl + openAmazonProduct (search-URL fallback preserved)
- `src/services/siri.ts` — ADDED `drive_brain_dump` shortcut alongside the existing 3
- `src/services/background.ts` — ADDED steps 3 (sync action cards) + 4 (activation coach) + 5 (receipt indexer) to the EXISTING TaskManager task; softened notification copy
- `src/screens/HomeScreen.tsx` — rebuilt as NowFeed (hero + scrollable stack + greeting + bundle detection + Focus + Bundle modals)
- `src/components/PriorityBadge.tsx` — anti-shame copy: 'Urgent' → 'Worth doing today', etc.
- `src/screens/SettingsScreen.tsx` — softened error alerts
- `src/screens/TriageScreen.tsx` — softened error alerts
- `src/screens/TasksScreen.tsx` — softened empty state
- `src/components/FloatingMic.tsx` — softened transcribe error
- `App.tsx` — 5 tabs → 4 (Now / All / Inbox / Settings); FloatingMic rendered above the tab navigator; legacy notification routes (Triage, Suggestions) mapped forward to current tabs

### Deleted
- `src/components/CaptureBar.tsx` — content moved into FloatingMic
- `src/screens/SuggestionsScreen.tsx` — content reframed as ActionCards in the Now Feed

### Decisions (non-obvious)
- **No EAS build this session.** `expo-speech ~14.0.8` was already in package.json (and shipping in the existing IPA — verified via grep on CaptureBar's import), so Drive Mode TTS needs no native rebuild. Phases A–G are pure JS/TypeScript. Logged as "no build needed" rather than burning a cap.
- **Source-of-truth model.** Source-projected ActionCards (voice/task/email/smart) keep status on the SOURCE; the persisted `actionCards` overlay only holds enrichments (firstStep, snoozeUntil, dismissed-overlay). Manually-created cards from contextMiner have `ctx-` ids and live entirely in the overlay. parseCardId() routes dismiss/mark-done back to the right source-specific store action.
- **Ring without SVG.** react-native-svg is not in deps; adding it would force a rebuild. The Focus Mode timer ring is two clipped half-circles with reanimated rotation transforms — same end result, no native dep added.
- **Bundle threshold = 3, only across action-shaped kinds.** `reorder_amazon`, `create_draft`, `create_calendar`, `add_task` qualify. `mark_done` and `snooze` do not — clustering those would just be visual noise.
- **Drive Mode = tap-to-stop with 30s auto-stop.** iOS doesn't expose continuous audio-level monitoring on expo-av, so the spec's "stop on 3s silence" is downgraded to a 30s ceiling + tap-to-stop. Logged as a TODO if real-time silence detection becomes available. The opening TTS prompt fires BEFORE recording starts so the prompt itself doesn't get captured.
- **Activation coach reads & writes `@adhd:actionCards` directly.** Avoids needing the React store inside a background TaskManager invocation. `syncSourcesToActionCards()` runs first (background step 3) to ensure the projected cards are in the file before the coach walks the list.
- **Receipt indexer search query.** Uses the spec's domain list plus tolerant subject fallback ("Your order" / "Order confirmation" / "Your Amazon order"). Window is `newer_than:180d` — long enough to cover seasonal reorders, short enough to keep the index small.
- **Notification re-routing.** Legacy notifications scheduled before this build will still pass `route: 'Triage'` or `route: 'Suggestions'` in their data payload. App.tsx maps both to the new tab names ('Inbox' and 'Now') so they keep navigating correctly without a re-schedule.

### Surprises
- expo-speech was already in package.json — discovered while skimming deps. The session prompt assumed Phase F would force a build; in reality every phase shipped via Metro.
- The pure ActionCard projection model meant I could ship the Now Feed without any data-migration logic. Existing captures, tasks, suggestions, and triaged emails just appeared as cards on first launch.

### Verification
- `npx tsc --noEmit` clean after every phase commit (8/8).
- Null-byte preflight clean: app.json / package.json / eas.json / tsconfig.json all 0 bytes.

### Hero flow status
The trashcan flow from the spec:
> "I need to buy a replacement piece for the trashcan. I bought it before, there's a receipt in my email."

End-to-end coverage now in place:
1. Voice → Whisper → text (live, untouched)
2. `isContextHinted()` matches "buy", "again", "in my email" patterns → routes to contextMiner
3. contextMiner consults the local PurchaseRecord index FIRST (sub-50ms, no tokens). If receipt indexer has run, the trashcan part is found immediately
4. Synthesized ActionCard with `reorder_amazon` payload (asin if extracted, else search query)
5. Card upserted to `@adhd:actionCards`, appears in Now Feed via the projection-merger
6. Curtis taps "Reorder on Amazon" → `https://www.amazon.com/dp/[ASIN]` deep links into the native Amazon app

Untested on device this session — Curtis needs to install the latest IPA and validate. Live transcript flow + contextMiner + receipt index can be smoke-tested without the Drive Mode shortcut by typing the trigger sentence into the manual text input.

### Next Session Should Start With
1. Reload Metro on the device — no rebuild needed:
   ```
   npx expo start --clear --tunnel
   ```
2. Smoke-test the Now Feed:
   - Confirm the 4-tab navigator (Now / All / Inbox / Settings) shows up; the old Suggestions tab should be gone
   - Confirm existing tasks, captures, suggestions, and triaged emails still appear (now as ActionCards in Now)
   - Tap the floating mic at the bottom-right of any tab; confirm voice/text capture still works
3. Trigger contextMiner manually:
   - In the text fallback, type something like "I need to reorder Brita filters again, I bought them before"
   - Should produce a card titled "Reorder Brita filters" with a "Reorder on Amazon" button (if a Brita receipt is in your inbox)
4. Trigger Bundle:
   - Add 3+ tasks via the mic ("buy paper towels", "buy dog food", "buy contact solution"). All three should cluster into a Bundle hero card on Now: "You have 3 things to buy. Want to knock them out?" Tapping opens BundleStack.
5. Trigger Focus Mode:
   - On any card, tap "Start" (only appears when firstStep is filled). The activation coach fills firstStep on cards >24h old in the background poll, so for testing: dismiss + restore a card, or wait a full background cycle. Quick way: any card you can tap "Start" on enters Focus Mode.
6. Drive Mode:
   - In iOS Settings → Siri & Search → ADHD Command Center, ensure "ARIA brain dump" is registered as a phrase (it gets donated on app launch). Say "Hey Siri, ARIA brain dump." App should open to Now and start recording within ~250ms with a TTS prompt "Drive mode. Speak now. I'll catch every thought." Tap mic to stop, or wait 30s for auto-stop.

If anything breaks: capture the Metro console line, paste into a fresh Claude Code session, name the file/screen.

### What WASN'T built
- iOS-native silence detection for Drive Mode auto-stop (deferred — no API surface in expo-av)
- Voice-controlled "next" / "done" inside Focus Mode (Phase D optional spec — flagged as TODO)
- All-tab redesigned as a flat ActionCard list (TasksScreen still shows the legacy 3-bucket UI; rename only, no rebuild)
- Inbox-tab ActionCard emission (TriageScreen unchanged in spirit per spec — its outputs DO appear as ActionCards in Now via the projection layer, but the screen itself still uses its own card UI for the in-Inbox triage flow)

### Blockers needing Curtis's attention
None. All authorization-gated steps (EAS build, Apple/Google portal changes) were not required.

---

## 2026-05-04 — Retroactive Phase A–H review pass

Curtis added a "Review Protocol — After Every Phase Commit (MANDATORY)" section to AUTONOMOUS_PROMPT.md after Phases A–H had already shipped. Per the retroactive clause in that section, ran one general-purpose review subagent per phase commit (the available agent inventory has no `code-reviewer` type; protocol explicitly authorizes the `general-purpose` fallback). Each agent ran the 7-check protocol (HOOK PRESERVATION / SPEC COMPLIANCE / TYPE / NULL-BYTE / ANTI-SHAME / ASYNCSTORAGE / STORE HYDRATION) against its assigned commit hash. Type and null-byte checks were verified once by the parent and stamped into each agent's prompt to avoid 8x redundant `tsc` runs.

### Verdicts

| Phase | Commit     | Verdict             | Notes                                                                |
|-------|------------|---------------------|----------------------------------------------------------------------|
| A     | `14f5dc8b` | SHIP IT             | All 7 checks pass. Bonus actions (`upsertCards`, `setCardFirstStep`) noted as forward-looking, not regressions. |
| B     | `540b5afb` | SHIP IT             | All 7. CaptureBar logic preserved verbatim in FloatingMic; legacy notification-route mapping correctly wired. |
| C     | `78754602` | SHIP IT             | All 7. Trigger-phrase coverage matches spec list; gmail.ts existing exports untouched. |
| D     | `8ffc2dd5` | SHIP IT             | All 7. Notification handler restored on exit; SVG-less ring is acceptable per the in-line spec deviation. |
| E     | `a8eca907` | SHIP IT             | All 7. Coach invoked from existing `ADHD_EMAIL_POLL`, not a new TaskManager task; cap, model, and prompt match spec. |
| F     | `cb65ad1b` | FIX BEFORE ADVANCING | Bundle dedupe missing (members rendered both inside the Bundle hero and again below it). Drive-mode 30s auto-stop guard read `isRecording` from a stale closure. |
| G     | `68bd88c4` | FIX BEFORE ADVANCING | Anti-shame audit missed one of three sign-in alerts in `SettingsScreen.tsx:251` (`'Sign-in error'` not softened alongside its siblings). |
| H     | `72f6441a` | SHIP IT             | Doc-only commit; log entry covers every Phase H requirement. |

### Fixes applied (single fixup commit, 3 files / +15 / −3)

- `src/screens/HomeScreen.tsx` — filter `feedCards` by the bundled kinds so 3+ same-kind members aren't double-rendered when their Bundle hero is shown.
- `src/components/FloatingMic.tsx` — Drive Mode auto-stop now reads `driveModeRef.current` (a ref) instead of the stale `isRecording` state captured at setTimeout creation. The ref is reset by `handleRecordingComplete` on manual tap-to-stop.
- `src/screens/SettingsScreen.tsx:251` — `'Sign-in error'` → `"Couldn't sign you in"` to match the other two sign-in alerts already updated in Phase G.

### Commits this pass

- `7eea4f6c` docs: add Review Protocol section to AUTONOMOUS_PROMPT.md
- `7ea7ceeb` fixup: retroactive phase A–H review fixes
- (this commit) docs: append Review Summary

### Verification after fixes

- `npx tsc --noEmit`: exit 0
- Working tree clean before this PROGRESS_LOG commit (verified pre-stage)

### Curtis's next move

That's where this session ends. Device smoke tests are Curtis's job. The IPA on disk renders all v2 changes (these were pure JS edits — no native rebuild required).

---

## 2026-05-05 — Device testing iteration 1 fixes

Curtis ran v2 on device and surfaced three issues. Bug 1 was the upstream cause; Bug 2 was its silent-failure symptom; Bug 3 was a UX redesign request after seeing the sequential bundle stepper in motion.

### Bug 1: Anthropic 429 rate limit on email triage  (commit `e99c31ac`)

**Symptom on device:** "Claude API error 429: rate_limit_error — Number of concurrent connections has exceeded your rate limit." Inbox tab fanned out 16 parallel `triageEmail` calls via `Promise.all`; Anthropic's concurrent-connection cap kills any naive fan-out at 10+.

**Fix — throttle, not batch.** Built `runWithConcurrency<T,R>(items, fn, opts)` in `src/services/utils.ts` with defaults `concurrency=2`, `spacingMs=250`, per-item error isolation, ordered output, null fallback for failures. Replaced both fan-out sites:
- `src/screens/TriageScreen.tsx:124` — foreground triage refresh
- `src/services/background.ts:84` — background poll triage

Greppped the rest of the codebase for `Promise.all` near `api.anthropic.com`. Zero remaining sites — `activationCoach` already runs serially, `smartScan` and `contextMiner` make single calls per invocation. Other `Promise.all` sites hit Gmail/SecureStore/AsyncStorage — out of scope.

**Why throttle over batch:** changing `TRIAGE_SYSTEM_PROMPT` to handle a list of emails would risk model-behavior drift (and we can't verify without burning tokens), one bad model response would lose all 16 results, and the throttle utility is reusable for any future Claude fan-out.

### Bug 2: Voice capture silently failing on subsequent recordings  (commit `0b3dfb2b`)

**Symptom on device:** first capture worked end-to-end (Whisper → contextMiner / processVoiceInput → ActionCard in Now Feed). Second and later captures appeared to record + transcribe but no card appeared, no toast, no error. Almost certainly Bug 1 in disguise — `processVoiceInput` hits the same 429 ceiling and the error gets swallowed.

**Fix — instrumentation + visible toast.** Touched only `src/components/FloatingMic.tsx`; `src/services/ai.ts` entry points unchanged.

Console logs at every pipeline boundary so the next failure can be traced from a Metro transcript without another iteration:
- recording STARTED
- recording STOPPED (uri length or NULL)
- Whisper RETURNED (transcript length)
- tryContextMine (hinted? signed in? cached count? matched? reason)
- processTranscript ENTRY (text length, drive-mode flag)
- processVoiceInput RETURNED (action count)
- per-action addCapture + routeAction (id, type, title)
- processTranscript EXIT (success / ERROR with stack trim)

Inline error toast at the top of the screen replaces three transient `Alert.alert` calls (transcribe, process, mic-start). Auto-dismisses after 4.5s. Anti-shame copy ("Couldn't pull that up. Try again?"). Rate-limit detection regex `/429|rate[_ ]?limit|concurrent/i` produces a specific message ("Hit the Claude rate limit. Give it a sec and try again.") so Curtis isn't left guessing if Bug 1 ever resurfaces. Setup-action alerts (Add your Claude key, OpenAI key, mic permission) stay as `Alert.alert` because they require navigating elsewhere, not retrying.

### Bug 3: Bundle list view + archive + Undo banner  (commit `29d784da`)

**Spec from device testing:** sequential card stepper replaced with a list pattern. Tap a row to expand inline. Dismiss → archive (recoverable). Undo banner globally available.

**New components:**
- `src/components/BundleListView.tsx` — list of compact rows with [primary action button] + [dismiss icon]; tap header to animate `maxHeight` + opacity expand revealing `firstStep`, `secondaryActions`, related-email count. Replaces `BundleStack.tsx` (deleted).
- `src/components/UndoBanner.tsx` — Gmail-style toast at bottom-of-screen above the FAB clearance. Slide-up + fade-in on `requestUndoBanner`, auto-dismiss after 5s, undo handler on tap. Rendered ONCE at `App.tsx` level via `<UndoBanner />` so any screen can pop it.
- `src/services/undoBanner.ts` — pub/sub matching the `voiceTrigger.ts` shape.

**Store + types:**
- `ActionCard.archivedAt: string | null` (optional field).
- `archivedCards: ActionCard[]` state, persisted under new key `@adhd:archivedCards`.
- `archiveCard(card)`: stamps `archivedAt` + `status='dismissed'`, stashes in `archivedCards`, removes from `actionCards` if present.
- `restoreCard(id)`: pulls back from archive. Manual cards (`ctx-`/`bundle-`/`manual-`) are re-upserted into `actionCards`; source-projected cards reappear automatically on next projection.
- 30-day TTL: `hydrate()` purges entries older than `ARCHIVE_TTL_MS` on every app open and persists the trimmed list.

**Wiring:**
- `HomeScreen.tsx` `visibleCards` filters out any card whose id is in `archivedCards`.
- Bundle modal `cards` prop pre-filters against `archivedCards` so dismissed members vanish from the list immediately.
- `onDismiss` → `archiveCard(c)` + `requestUndoBanner({ message, onUndo: () => restoreCard(c.id) })`.

**Out of scope for v1.1:** Now Feed swipe-to-dismiss still routes to source-specific dismiss (existing behavior). Unifying that with the archive flow is a follow-up if Curtis wants the global undo to cover swipes too.

### Review pass

Spawned three general-purpose review agents in parallel (one per fix commit) using the Review Protocol from `AUTONOMOUS_PROMPT.md`. Each ran the 7-check protocol against its assigned commit hash. Type and null-byte checks were verified once by the parent.

| Bug | Commit     | Verdict   |
|-----|------------|-----------|
| 1   | `e99c31ac` | SHIP IT   |
| 2   | `0b3dfb2b` | SHIP IT   |
| 3   | `29d784da` | SHIP IT   |

No fixup commit needed — all three landed clean on the first pass.

### What didn't ship in this iteration

- Now Feed swipe-to-dismiss still uses source-specific dismiss; the new global Undo banner is wired only for Bundle list dismiss. If Curtis wants a unified flow, that's a 30-min follow-up.
- Bug 2 toast is in-component on `FloatingMic`; could be migrated to the global toast pattern (`requestUndoBanner` shape) for consistency, but the toast doesn't need an Undo handler so the existing local UI is fine.
- Voice-controlled "next"/"done" inside Focus Mode and iOS-native silence detection in Drive Mode remain deferred (no API surface).

### Verification

- `npx tsc --noEmit`: exit 0 after each commit.
- Null-byte preflight: `app.json`, `package.json`, `eas.json`, `tsconfig.json` all 0 bytes.
- Working tree clean before this PROGRESS_LOG commit (verified pre-stage).

### Curtis's next move

Reload Metro on the device. Smoke test in this order:
1. **Inbox refresh** — pull-to-refresh with 10+ unread emails. Should NOT 429. Watch the Metro console for any `[TriageScreen.triage]` or `[BackgroundPoll.triage]` warnings (those are per-item failures from the throttle helper, expected to be rare and isolated).
2. **Voice capture, repeat 5x** — hold mic, speak, release. Card should appear each time. If any fail, look for `[FloatingMic][voice]` log lines — they'll narrate the exact failure point. Toast should appear if Claude errors.
3. **Bundle list flow** — capture 3+ same-shape items (e.g., three "buy X" tasks). Now Feed should show a Bundle hero card. Tap it → list view, tap a row to expand, tap primary action or dismiss. Dismissing pops the Undo banner at the bottom; tap Undo within 5s to restore.

If anything still misbehaves, paste the Metro log line (look for `[FloatingMic][voice]`, `[TriageScreen.triage]`, `[BackgroundPoll.triage]`, or `[UndoBanner]`) into a new session.

---

## 2026-05-05 — Device testing iteration 2 fixes

Curtis took the iteration 1 build to device, surfaced two real bugs and made one design call after seeing the feed in motion. All three landed in three sequential commits, all three SHIP IT on first review.

### Bug A: Routed voice captures hidden from Now Feed  (commit `b01b6930`)

**Symptom:** Curtis recorded a voice note. Whisper transcribed. Claude clarification TTS spoke. The action fired — a real Gmail draft appeared in his actual Drafts folder. **No ActionCard appeared in the Now Feed.** The voice → side-effect path was working; the voice → card-render path was broken.

**Root cause:** `cardFromCapturedAction.statusFromCapture` mapped source.status `'routed'` → ActionCardStatus `'done'`, and `NowFeed.visibleCards` filters out anything that isn't `'pending'`. The card was being projected, just immediately filtered.

**Fix in `src/services/actionCards.ts`:**
- `statusFromCapture`: routed captures stay `'pending'` in the projection.
- When `source.status === 'routed'`, override `primaryAction` to `{ kind: 'mark_done', label: 'Got it' }` so tapping the button cannot re-execute the side effect (no double-Gmail-draft, no double-event).
- Replaced `urgencyFromPriority(p)` with `urgencyFromCapture(a)`. New rule: voice captures default to `'today'` unless the AI extracted an explicit future date — then proximity-derived (<24h: today, <7d: this_week, else someday). Matches the design call's "today is the right default for an ADHD brain capturing now" rule.
- Removed the now-unused `urgencyFromPriority` helper.

### Bug B: Duplicate cards everywhere  (commit `42321125`)

**Root cause:** `normalizeSuggestion` in `smartScan.ts` minted a fresh `nanoid` for every parsed item, so the same logical scan result produced a different `SmartSuggestion.id` on every 15-minute background scan. `setSuggestions`' merge-by-id silently appended instead of upserting, and `cardFromSmartSuggestion` faithfully projected each duplicate as its own ActionCard. Other converters (voice / task / email) were already keyed off stable source ids and not implicated.

**Fix:**
- `src/services/utils.ts`: ADD `stableHash(input)` — djb2 variant, 8-char hex output, pure, no deps.
- `src/services/smartScan.ts`: `normalizeSuggestion` now sets `id: stableHash(suggestionDedupKey(type, title, sourceEmailId))`. Same content → same id, every run. The exported `dedupKey` widens to `Pick<SmartSuggestion, 'type' | 'title' | 'sourceEmailId'>` and delegates to `suggestionDedupKey` — id minting and the existing background.ts merge step agree on what counts as a duplicate. Dropped the `'smart-'` prefix from `SmartSuggestion.id`; that namespace belongs to `cardFromSmartSuggestion` (`smart-${s.id}`).
- `src/store/index.ts`: ADD `dedupeById<T>` helper that collapses entries sharing an id, keeping latest `createdAt`. `hydrate()` runs the dedupe pass over both `actionCards` and `suggestions` on every app open and persists if anything changed. Cleans up legacy duplicates from earlier builds at first launch after the upgrade. New entries use stable ids and won't re-accumulate.

### Design call: Time-horizon All tab + Now-Feed urgency filter  (commit `2e35c99e`)

**Curtis's read:** the feed was getting cluttered because everything-actionable was rendering in one stack regardless of horizon. Time-horizon grouping reduces overwhelm.

**NEW `src/screens/AllScreen.tsx`** — three-section `SectionList`:
- Today (urgency in `{now, today}`), This Week (`this_week`), Later (`someday`), in that order.
- Each header shows count + expand/collapse chevron. Auto-collapse on first render if section has > 5 items.
- Anti-shame empty states per spec ("Caught up. Nothing pulling at you right now.", "Nothing planned this week yet.", "No long-haul stuff on your plate.") rendered as section footer when expanded with zero items.
- Reads `route.params.expandSection` so the NowFeed footer link can land here with the right section already opened (and the others collapsed).
- Same source-aware action router as HomeScreen: tap primary → perform payload → `markDoneAcrossSources` by id-prefix.

**`HomeScreen.tsx`:** `visibleCards` filtered to urgency in `{now, today}` only. Cards in `this_week` / `someday` no longer surface in Now. Added a footer text link below the feed: `"X this week · Y later →"`. Tapping it navigates to `All` with `expandSection` set so the user lands on the right horizon already opened. Renders only when there's actually something in those buckets.

**`App.tsx`:** swapped `TasksScreen` → `AllScreen` for the All tab. Now-tab badge now counts only urgency in `{now, today}` (matches what NowFeed displays). `archivedCards` excluded from the count too.

**`src/screens/TasksScreen.tsx`:** DELETED. The legacy 3-bucket layout (Today / Upcoming / Someday) is replaced by the AllScreen urgency-grouped SectionList. Task data still flows through the Zustand store unchanged.

### Review pass

3 general-purpose review subagents in parallel, one per commit. Per the Review Protocol's `code-reviewer`-or-`general-purpose` fallback (no `code-reviewer` agent type in this Claude Code install). Type and null-byte checks verified once by the parent and stamped into each prompt.

| Bug      | Commit     | Verdict   | Notes                                                                |
|----------|------------|-----------|----------------------------------------------------------------------|
| A        | `b01b6930` | SHIP IT   | All 7 PASS. One cosmetic nit (stale comment about a removed helper) — fixed inline in this log commit alongside the cosmetic refresh. |
| B        | `42321125` | SHIP IT   | All 7 PASS. dedupeById uses `>=` so equal-timestamp duplicates resolve deterministically (later-in-input wins). |
| Design   | `2e35c99e` | SHIP IT   | All 11 sub-checks (a–k) PASS. SectionList native, route param wiring works, Anti-shame copy verbatim. |

No standalone fixup commit needed for behavioral issues. The only fix bundled into this log commit is the cosmetic comment refresh in `actionCards.ts`.

### Verification

- `npx tsc --noEmit`: exit 0 after each commit.
- Null-byte preflight: `app.json`, `package.json`, `eas.json`, `tsconfig.json` all 0 bytes.

### Curtis's next move

Reload Metro (or hot-reload — these are pure JS edits). Smoke test:

1. **Voice capture → Gmail draft surface check.** Hold mic, say something like "draft an email to Marcus about Friday." Verify (a) the Gmail draft appears in your Drafts folder AND (b) an ActionCard appears in Now Feed with title set, context "Captured by voice • Gmail draft saved", and a "Got it" button. Tapping "Got it" should dismiss the card without creating a second draft.
2. **Duplicate sanity.** Pull down on Now Feed to trigger a fresh smart scan. Compare against existing cards — same logical suggestions should NOT produce new entries. If any duplicates remain from pre-fix scans, they should collapse to one entry on the next app launch (hydrate's dedupe pass).
3. **All tab horizon view.** Tap the All tab. Three sections (Today / This Week / Later). Section with > 5 cards starts collapsed; tap header to expand. Empty section shows the warm copy.
4. **Footer link.** With at least one this-week or later card, look under the Now Feed for "X this week · Y later →". Tap it; should jump to All with the right section pre-expanded.
5. **Voice urgency default.** New voice capture without an explicit date → card lands in Today section. Voice capture with explicit "next Monday" → card lands in This Week.

If anything misbehaves, the existing log lines (`[FloatingMic][voice]`, `[TriageScreen.triage]`, etc.) will narrate the failure. Bug A's fix didn't need new converter logging — the bug was a deterministic projection issue, not a runtime mystery.

---

## 2026-05-05 — Device testing iteration 3 fixes

Curtis took the iter-2 build to device. Two real misses:

> "the recording is working, transcription is working. but it created two tasks, one has 'got it' the other has 'mark complete'. It did this for every recording. there are still tons of duplicates in the 'all' tab"

Both shipped clean on first review.

### Issue 1: Two ActionCards per voice recording  (commit `b28e5a03`)

**Symptom on device:** every voice recording produced two cards. One labeled "Got it" (the routed-voice projection introduced in Bug A's fix) and one labeled "Mark done" (the Task projection from `cardFromTask`). The user's mental model: "I said one thing — why are there two cards?"

**Root cause:** `routeAction(type='task')` does both `addTask(newTask)` AND `updateCapture(status='routed')` on the parent CapturedAction. Both then project independently:
- The routed CapturedAction projects via `cardFromCapturedAction` as a "Got it" voice card (post-Bug A: routed captures stay `pending` so they surface).
- The new Task projects via `cardFromTask` as a "Mark done" card.

Bug A surfaced routed voice captures so Curtis could SEE the side effect happened — but for `type='task'` specifically, the Task itself already provides that surface. Two cards for the same recording.

**Fix in `src/services/actionCards.ts` `projectAllSources`:** filter out captures where `type === 'task' && status === 'routed'`. The Task card stands alone. Other routed types keep their voice card because nothing else surfaces them locally:
- `gmail_draft`: lives in Gmail Drafts (no local entity)
- `calendar_event`: lives in Google Calendar (no local entity)
- `note`: addNote stores it but Notes don't project to cards

Reviewer verified the lifecycle: routed Task → projects pending → tap "Mark done" → `toggleTask` flips `completed: true` → projects with status `done` → `visibleCards` filter excludes it. Clean.

### Issue 2: "Tons of duplicates" in All tab  (commit `92f784fd`)

**Honest assessment:** Bug B from iter 2 only fixed *new* SmartSuggestions. Persisted state from before that commit still had nanoid ids — different per scan even when content matched. `dedupeById` only collapses exact id matches, so the legacy duplicates slipped through every hydrate.

This iteration delivers the actual cleanup that Bug B implied but didn't ship. Three sub-fixes, all in `hydrate()`:

**(1) Migrate persisted SmartSuggestion ids.** For every suggestion in `@adhd:suggestions`, recompute the expected id as `stableHash(suggestionDedupKey(s))`. If it doesn't match the stored id, swap. Then `dedupeById` collapses content-equivalent entries that now share an id. Persistence triggered when *either* length changed *or* any id was rewritten.

**(2) Drop orphan smart-prefixed entries from `@adhd:actionCards`.** `syncSourcesToActionCards` (background poll step 3) writes projected smart cards into persistent storage. After old scans, those entries pin to `smart-${oldnanoid}` ids that no longer match any current projection's `smart-${newhash}` id. `mergeStoredOverlays` then treats them as user-authored ctx-style cards and renders them forever. Filter: keep `smart-` entries only if their id is in `validSmartIds` (built from the post-migration, post-dedupe SmartSuggestion list). `voice-`/`task-`/`email-` entries kept — they hold firstStep enrichments the activation coach needs.

**(3) Collapse ctx- cards by content.** Curtis recording the same intent twice ("reorder Brita filters" Monday and Wednesday) produces a fresh `ctx-${nanoid}` card from `contextMiner` each time. Group ctx- entries by `${title}|${JSON.stringify(primaryAction)}` and keep the latest `createdAt`. ContextMiner doesn't have a stable content key today; the primaryAction encodes the deep-link target, so this is a reasonable proxy.

**Side effect (logged in the commit):** SmartSuggestions previously archived under their old `smart-${oldnanoid}` id will resurface once because the archive entry no longer matches any current projection. Curtis re-archives once; the feed stays clean afterwards. Acceptable trade for clearing the persistent duplicate pile.

### Review pass

2 general-purpose review subagents in parallel — one per commit. Type and null-byte checks verified once by parent.

| Issue | Commit     | Verdict | Notes                                                          |
|-------|------------|---------|----------------------------------------------------------------|
| 1     | `b28e5a03` | SHIP IT | All 7 PASS. Lifecycle of Task projection verified clean (toggleTask flips status to done → filtered). One non-blocking edge note about hypothetical "undo route" path. |
| 2     | `92f784fd` | SHIP IT | All 7 PASS, all 8 issue-specific sub-checks PASS. Persistence conditions verified sufficient. Type compatibility (`Pick<...>` accepts wider `SmartSuggestion`) confirmed. Side-effect re-archive cost acknowledged and accepted. |

No fixup commits needed.

### Verification

- `npx tsc --noEmit`: exit 0 after each commit.
- Null-byte preflight: app.json / package.json / eas.json / tsconfig.json all 0 bytes.

### Curtis's next move

Reload Metro. Kill and re-launch the app once so `hydrate()` runs the migration / orphan-drop / ctx-dedupe pass against existing storage. Then smoke test:

1. **Voice → Task: one card.** Hold mic, say "remind me to take out the trash." Single ActionCard appears in Today section with title set + "Mark done" button. (Pre-fix: two cards, "Got it" + "Mark done".)
2. **Voice → Gmail draft: still surfaces.** Hold mic, say "draft an email to Marcus about Friday." Single voice card in Today with "Captured by voice • Gmail draft saved" context and "Got it" button. The actual draft is in Gmail.
3. **All tab cleanup.** Open All tab. Stale duplicate cards from previous scans should be gone after the cold launch. Sections (Today / This Week / Later) should each show distinct entries.
4. **Re-archive smart cards if needed.** Any previously-archived smart suggestion that resurfaces, swipe-archive once. It stays gone afterwards.
5. **Background scan duplicate check.** Wait for the next 15-min background scan (or pull-to-refresh on Now). New suggestions don't accumulate duplicates — same content keeps the same id and `setSuggestions` upserts cleanly.

If duplicates persist in any form, paste one of them into a new session with `git show --stat 92f784fd` so I can see what slipped through.

---

## 2026-05-05 — Device testing iteration 4 fixes

> Curtis: "the voice recording, transcription, and adding it to the 'Now' tab worked! but there's still TONS of duplicates on the now bundles and the task page. the inbox looks great! but i'd like to see it in list view rather than card/swipe view."

Voice → ActionCard now confirmed working end-to-end (Issue 1 from iter 3 ✓). Two remaining: persistent duplicate cards (different cause than iter 3 caught), and an Inbox UX swap. Both shipped clean on first review.

### #1: Content-level dedupe at projection time  (commit `af1e9993`)

**The actual root cause — not what iter 3 fixed.** Iter 3 made SmartSuggestion ids deterministic and migrated stale ones. But Curtis's most-frequent duplicate source isn't smart suggestions — it's that he's been recording the same intent multiple times. Each recording produces a fresh `Task` (new nanoid id) with the same title. `cardFromTask` projects each separately. Five recordings of "take out the trash" → five distinct Tasks → five projected cards. `dedupeById` couldn't catch these (the ids ARE distinct, the content isn't).

**Fix in `src/services/actionCards.ts`:**
- ADD `collapseByContent<T extends ActionCard>(cards)` — groups by `${source}|${normalized_title}`, keeps latest `createdAt`. Source data untouched; only the rendered projection collapses.
- Apply in `projectAllSources` to `fromCaptures` and `fromTasks` (the source types whose ids are per-event nanoids and can therefore have content duplicates). Email and SmartSuggestion projections left alone — those have content-stable ids already.
- Apply in `mergeStoredOverlays` to the `manualOnly` path so `ctx-` / `manual-` / `bundle-` cards from in-session activity collapse without waiting for the next hydrate. Curtis saying the same memory-augmented thing twice in one session no longer surfaces twice.

**Side effect:** if the user genuinely has two unrelated cards with the same exact title (rare — would have to phrase identically), only the latest surfaces. Acceptable trade for ADHD UX where surfacing duplicate copies is the bigger problem.

**Reviewer flagged one non-blocking note:** title normalization is `lowercase + trim + collapse-whitespace`. Doesn't catch punctuation variants ("Take out trash." vs "Take out trash"). Will iterate if Curtis reports near-duplicates after this build.

### #2: Inbox list view  (commit `27c83b50`)

**Spec:** keep the triage results identical, swap the surface from a single card with swipe gestures to a list with tap-to-expand inline.

**Approach:** rewrote `src/screens/TriageScreen.tsx` end-to-end while preserving every piece of plumbing verbatim:
- `runTriage` with the iter 1 throttled fan-out (concurrency=2, spacingMs=250) — unchanged.
- All five action handlers (`reply` → `createDraft`, `calendar_event` → `createEvent`, `task` → `addTask`, `archive` → `archiveMessage`, `snooze` → `scheduleNotificationAsync` with TIME_INTERVAL trigger) — call the same downstream APIs in the same order with the same toasts.
- Auto-fetch on first focus per session — unchanged.
- Pull-to-refresh — unchanged.
- Anti-shame copy — unchanged ("Inbox zero", "Couldn't pull that up", "Couldn't do that").

**New surface:** `FlatList` of `TriageRow` entries sorted by priority (urgent → action_needed → fyi → noise). Each row shows priority badge + sender name + subject (2-line clamp) + summary preview. Tap → animated inline expand revealing full summary + priority reason + suggested-action buttons + a "Mark as read & skip" link. Single-expansion: tapping a different row collapses the previous one.

**Removed:** `SwipeableTriageCard` component and its gesture/transform logic (~300 lines collapsed to a tap-to-expand row). The Inbox now contains zero swipe gestures.

### Review pass

2 general-purpose review subagents in parallel, one per commit. Type and null-byte checks verified once by parent.

| # | Commit     | Verdict | Notes                                                                           |
|---|------------|---------|---------------------------------------------------------------------------------|
| 1 | `af1e9993` | SHIP IT | All 7 PASS. Source data verified untouched. Tie-breaker (`>=`) correct. Manual-overlay dedupe verified. |
| 2 | `27c83b50` | SHIP IT | All 7 PASS. All 5 action types verified parity with prior swipe build. Throttled fan-out preserved. Single-expansion behavior confirmed. |

No fixup commits needed.

### Verification

- `npx tsc --noEmit`: exit 0 after each commit.
- Null-byte preflight: `app.json` / `package.json` / `eas.json` / `tsconfig.json` all 0 bytes.

### Curtis's next move

Hot-reload Metro (no cold launch needed this round — this iter's dedupe runs at render time, not hydrate). Then:

1. **Now bundles + All tab.** Open both. Stale duplicate cards from previous recordings should be collapsed to a single card per unique title in each section. If Curtis recorded "take out the trash" five times, there's now ONE card with the latest timestamp.
2. **Same-content session repeat.** While the app is open, hold the mic and say something. Then say it again. Both should still register as separate captures in the source store, but only one card should appear in the feed. (If Curtis wants to see both, he records different phrasings.)
3. **Inbox list view.** Open Inbox. List of email rows sorted by priority. Tap a row — expands inline with full summary + action buttons. Tap a different row — previous collapses, new one expands. Tap an action button (Reply / Add to Calendar / etc.) — works exactly as before, the email leaves the queue with a confirmation toast. Pull to refresh — fetches + re-triages.
4. **Punctuation-variant edge case.** If two cards titled "Take out trash" and "Take out trash." both linger after this build, that's the non-blocking nit the reviewer flagged. Worth fixing if it shows up; the fix would be to strip trailing punctuation in the dedupe key.

If anything misbehaves, paste the offending screenshot + the relevant git show into a new session.

---
