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
