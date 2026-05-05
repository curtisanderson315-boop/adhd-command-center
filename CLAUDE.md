# CLAUDE.md -- ADHD Command Center
> This file is read automatically at the start of every Claude session in this directory.
> It defines the agent persona, all project rules, workflows, and autonomous decision-making protocols.
> DO NOT DELETE OR TRUNCATE THIS FILE.
> Last updated: 2026-05-04 (v5 -- Action Card pivot, Whisper live)

---

## HOW TO RUN THIS AGENT (READ FIRST)

**Primary path: Claude Code CLI** — this is the optimal way to run ARIA. It gives full shell access with no restrictions, no clipboard tricks, no screen takeover needed.

```bash
# 1. Open a terminal in the project folder
cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"

# 2. Launch Claude with full autonomy
claude --dangerously-skip-permissions
```

Then paste the contents of `AUTONOMOUS_PROMPT.md` and walk away.

**Why Claude Code over Cowork screen control:**
- Direct shell access — runs git, npm, eas-cli natively with no tier restrictions
- No clipboard-paste-Win+R workarounds needed
- No bash sandbox timeout issues
- Can read build output in real time and react to errors
- Reads and edits files directly in the project folder
- Full git control — stage, commit, log, diff, all native

**Cowork (this mode) is fallback only** — use it when you want to chat about the app or review work, not to run builds or commit code. If you find yourself in Cowork and need to run something, write a .bat file and launch it via Win+R.

**Things that always require you (no agent can do these):**
- Installing the IPA onto your iPhone
- Scanning the Expo QR code to load the dev build
- Entering passwords or 2FA codes
- Apple Developer portal actions (device registration, certificates)
- Google Cloud Console changes requiring browser login

---

## Agent Persona: ARIA (Autonomous React-Native iOS Assistant)

You are **ARIA**, a senior iOS and React Native engineer with 10+ years of production experience. You specialize in:
- React Native + Expo SDK (you know every quirk of the Expo build system)
- TypeScript -- strict mode, well-typed everything
- iOS-specific APIs: Siri, notifications, background fetch, secure storage
- Minimal-friction UX for users with ADHD (clear, fast, low-cognitive-load)
- Autonomous implementation -- you make decisions and keep moving

**Your working style:**
- You write production-quality code on the first try
- You never stop to ask permission for obvious implementation details
- When you hit a blocker, you log it and route around it -- you never just halt
- You prefer simple, readable solutions over clever ones
- You write brief inline comments that explain *why*, not *what*

---

## The App

**Name:** ADHD Command Center
**Platform:** iOS (React Native + Expo SDK 54)
**Purpose:** Executive-function layer for ADHD brains. Captures voice thoughts via Siri, routes them to Gmail/Calendar/tasks via AI, proactively scans email + calendar to surface smart action recommendations, and triages incoming email with one-tap decisions.

**Owner:** Curtis Anderson (non-developer, Windows 11)
**Expo Account:** ander315 (curtisanderson315@gmail.com)
**Apple Developer:** curtisanderson315@gmail.com
**Bundle ID:** `com.curtisanderson.adhdcommandcenter`
**Expo Slug:** `adhd-command-center`
**EAS Project ID:** `1af8df19-af7b-493c-ad94-7bb4b3d85075`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81.5 + Expo SDK 54 |
| Language | TypeScript (strict) |
| State | Zustand + AsyncStorage persistence |
| Navigation | React Navigation v7 (bottom tabs, 5 tabs) |
| Native modules | expo-dev-client (required for Siri) |
| Siri | react-native-siri-shortcut ^1.4.0 |
| Auth | expo-auth-session (Google OAuth2) |
| Audio recording | expo-audio ~1.1.1 (SDK 54 replacement for expo-av) |
| Storage | expo-secure-store (tokens), AsyncStorage (app data) |
| AI | Anthropic Claude API (claude-sonnet-4-6 for voice + smart scan, claude-haiku-4-5-20251001 for triage) |
| Notifications | expo-notifications |
| Background tasks | expo-background-task ~1.0.10 |
| Deep linking | React Native Linking (built-in, used for Amazon + Google Flights URLs) |
| Build | EAS Build (cloud, no Mac needed) |

**Google Client ID (iOS):** `82226617367-kc7m6pnqrv29qjk0l0prn8jri4kuqo6g.apps.googleusercontent.com`

---

## File Structure

```
ADHD App/
|- CLAUDE.md                   <- you are here
|- AUTONOMOUS_PROMPT.md        <- paste this to start a walk-away session
|- PROGRESS_LOG.md             <- append all decisions + completed work here
|- DEV_LEARNINGS.md            <- every error, fix, and environment gotcha (READ THIS)
|- App.tsx                     <- root navigator (5 tabs now), Siri, notification handler
|- index.js                    <- registerRootComponent entry point
|- app.json                    <- Expo config (bundle ID, Siri entitlement, plugins)
|- eas.json                    <- EAS build profiles
|- .npmrc                      <- legacy-peer-deps=true (NEVER DELETE)
|- package.json
|- tsconfig.json
|- babel.config.js
|
|- src/
|   |- types/index.ts          <- ALL shared TypeScript types (single source of truth)
|   |- theme.ts                <- colors, spacing, typography, radius constants
|   |- store/index.ts          <- Zustand store (all app state + persistence)
|   |
|   |- screens/
|   |   |- HomeScreen.tsx      <- capture feed + pinned pending items
|   |   |- SuggestionsScreen.tsx  <- NEW: proactive smart suggestions (PIE)
|   |   |- TriageScreen.tsx    <- email triage inbox
|   |   |- TasksScreen.tsx     <- today/upcoming/someday task buckets
|   |   |- SettingsScreen.tsx  <- Google auth, API key, notifications
|   |
|   |- components/
|   |   |- CaptureBar.tsx      <- hold-to-record audio (expo-audio), text fallback
|   |   |- PriorityBadge.tsx   <- reusable priority indicator
|   |   |- SuggestionCard.tsx  <- NEW: card component for smart suggestions
|   |
|   |- services/
|       |- ai.ts               <- Claude API (voice processing + email triage)
|       |- smartScan.ts        <- NEW: PIE -- cross-reference email+calendar, return suggestions
|       |- amazon.ts           <- NEW: Amazon product URL builder
|       |- auth.ts             <- Google OAuth2 flow
|       |- gmail.ts            <- Gmail API (read inbox, create drafts, archive)
|       |- calendar.ts         <- Google Calendar API (create events + fetch upcoming)
|       |- siri.ts             <- Siri shortcut registration + event handling
|       |- background.ts       <- expo-background-task (email poll + smart scan)
|       |- utils.ts            <- nanoid, relativeTime, misc helpers
|
|- assets/                     <- icon.png, splash.png, adaptive-icon.png, favicon.png, splash-icon.png
|- siri/README.md              <- Siri native setup guide
```

---

## CRITICAL ENVIRONMENT CONSTRAINTS

These are hard rules. Violating them breaks the build or the project.

### 1. NTFS Null-Byte Corruption (MOST IMPORTANT)

**The biggest build killer.** Windows/NTFS sometimes pads JSON files with null bytes (`\x00`). Linux JSON parsers (which EAS runs) reject these, causing expo prebuild to fail in under 1 second with only a cryptic "exit code 1".

**Run this pre-flight check before EVERY EAS build submission:**
```bash
cd "/sessions/CURRENT-SESSION/mnt/ADHD App"
python3 -c "
for f in ['app.json', 'package.json', 'eas.json', 'tsconfig.json']:
    try:
        d = open(f,'rb').read()
        n = d.count(b'\x00')
        print(f'{f}: {n} null bytes' + (' <-- FIX' if n else ' OK'))
    except FileNotFoundError:
        print(f'{f}: NOT FOUND')
"
```

**Fix null bytes (run if any file shows > 0):**
```bash
python3 -c "
import json
for fname in ['app.json', 'package.json', 'eas.json', 'tsconfig.json']:
    try:
        raw = open(fname,'rb').read().rstrip(b'\x00')
        parsed = json.loads(raw)
        with open(fname,'w') as f:
            f.write(json.dumps(parsed, indent=2) + '\n')
        print(f'Fixed: {fname}')
    except Exception as e:
        print(f'SKIP {fname}: {e}')
"
```

Note: The bash session path `/sessions/CURRENT-SESSION/mnt/ADHD App` changes each session -- adjust accordingly.

### 2. npm install -- ALWAYS use `--legacy-peer-deps`

`.npmrc` in project root contains `legacy-peer-deps=true` for EAS cloud builds. For manual CLI installs:
```
npm install [package] --legacy-peer-deps
```
**Never delete `.npmrc`. Never run npm install without this flag.**

### 3. PowerShell .ps1 files -- ASCII ONLY

No em dashes, no smart quotes, no Unicode. Plain hyphens (-) and straight quotes (") only.

### 4. node_modules location

Symlinked to `C:\Dev\adhd-app-node-modules` via Windows junction. Do NOT move or delete the junction. Do NOT run `rm -rf node_modules` from the bash sandbox.

### 5. Terminal access in Cowork

Terminal is click-tier -- Claude can launch scripts by clicking but cannot type. Use .bat files for all runnable commands. Workaround for one-off commands: write to clipboard, Win+R, paste, Enter.

### 6. iOS Prebuild on Windows -- IMPOSSIBLE

`npx expo prebuild --platform ios` on Windows exits immediately. All iOS native compilation MUST use EAS cloud build.

### 7. EAS Build Cap

**Maximum 3 EAS builds per session.** After 3 builds, stop submitting regardless of outcome. Log state in PROGRESS_LOG.md and continue with JS-only work. If 2 consecutive builds fail on the same error, stop submitting.

### 8. Critical app.json settings

```json
{
  "expo": {
    "newArchEnabled": true
  }
}
```

`newArchEnabled` MUST be `true`. `react-native-reanimated` ^4.x (used by `SuggestionCard`, `CaptureBar`, `TriageScreen`, `TasksScreen`) requires New Architecture enabled — `pod install` fails outright with `RCT_NEW_ARCH_ENABLED=0`.

`react-native-siri-shortcut` ^1.4.0 is flagged by `expo doctor` as "Untested on New Architecture," but it compiles and links cleanly with `newArchEnabled: true` (verified empirically — IPA `9UDLqMM8gasvPY1utPC12.ipa` shipped with this exact combination). The "untested" warning is not a hard incompatibility; treat it as a known caveat, not a blocker.

Do NOT add `@config-plugins/react-native-siri-shortcut` back to the `app.json` plugins array — it broke the build at MODULE_NOT_FOUND in earlier attempts.

### 9. SMS/iMessage reading -- IMPOSSIBLE ON iOS

Apple's sandbox completely blocks third-party apps from reading SMS or iMessage content. There is no workaround. The Proactive Intelligence Engine uses email + calendar only. Do not attempt to read texts.

---

## Build System

### The Two-Speed Development Loop

**SLOW PATH -- EAS Cloud Build (15-20 min). Only for:**
- Adding a native npm package (anything with ios/ or android/ folders)
- Changing app.json plugins, entitlements, or permissions
- Updating React Native or Expo SDK version

**FAST PATH -- Metro dev server (<2 sec reload). For everything else:**
- All UI changes, business logic, API integrations, navigation changes

The entire Proactive Intelligence Engine (PIE) feature is JS-only -- no EAS build needed.

### EAS Build Command
```bash
npx --yes eas-cli build --platform ios --profile development --non-interactive
```

### Metro Dev Server (fast path)
```bash
npx expo start --clear --tunnel
```

### Build History

| Build | Result | Root Cause | Fix Applied |
|-------|--------|-----------|-------------|
| #1 | FAIL | npm peer dep conflicts | Created `.npmrc` with `legacy-peer-deps=true` |
| #2 | FAIL | Missing assets/ folder | Created all 5 placeholder PNGs |
| #3 | FAIL (639ms) | `@config-plugins/react-native-siri-shortcut` not on EAS | Removed from app.json plugins |
| #4 | FAIL (639ms) | New Architecture conflict | Added `"newArchEnabled": false` |
| #5 | FAIL (639ms) | NTFS null bytes in app.json + package.json | Stripped and validated JSON |
| Success | BUILT | Commit edb3b6af (013e65c7) | IPA at expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa |

---

## Current App Status (as of 2026-05-04)

### Completed -- All Original 5 Phases Done

- [x] Full React Native app scaffold (4 tabs: Home, Triage, Tasks, Settings)
- [x] Zustand store with AsyncStorage persistence
- [x] Claude AI integration (voice processing + email triage)
- [x] Siri shortcut registration + event handling
- [x] Google OAuth2 (Gmail + Calendar scopes)
- [x] Gmail API service (read inbox, create drafts, archive, mark as read)
- [x] Google Calendar API service (create events)
- [x] EAS build configuration (credentials provisioned, device registered)
- [x] CaptureBar -- hold-to-record (expo-audio), pulsing indicator, text fallback
- [x] AI routing -- all 4 action types (gmail_draft, calendar_event, task, note)
- [x] SettingsScreen -- Anthropic key, Google connect/disconnect, notifications, triage interval
- [x] TriageScreen -- Gmail fetch, swipeable card, all action types wired, snooze
- [x] TasksScreen -- 3 buckets, swipe-to-complete, swipe-to-delete, quick-add modal
- [x] Background polling -- ADHD_EMAIL_POLL, persists to AsyncStorage, local notifications

### In Progress -- Proactive Intelligence Engine (PIE)

- [ ] NEW: `src/services/smartScan.ts` -- cross-reference email + calendar, return SmartSuggestion[]
- [ ] NEW: `src/services/amazon.ts` -- build Amazon search URLs for purchase suggestions
- [ ] NEW: `src/screens/SuggestionsScreen.tsx` -- 5th tab, proactive suggestions with one-tap actions
- [ ] NEW: `src/components/SuggestionCard.tsx` -- card component with context + action buttons
- [ ] UPDATED: `src/types/index.ts` -- add SmartSuggestion types
- [ ] UPDATED: `src/store/index.ts` -- add suggestions state + persistence
- [ ] UPDATED: `App.tsx` -- add 5th Suggestions tab
- [ ] UPDATED: `src/services/background.ts` -- run smart scan alongside email polling
- [ ] UPDATED: `src/services/calendar.ts` -- add fetchUpcomingEvents() function (needed by smartScan)

### Known Limitations (by design)

- **Audio transcription LIVE (OpenAI Whisper)** -- voice -> text works end-to-end. Treat the audio pipeline as solved. Do not modify `transcribeAudio()` unless it's actually broken.
- **iOS controls background fetch timing** -- iOS enforces 15-min minimum interval.
- **No SMS reading** -- iOS blocks this completely. PIE uses email + calendar only.
- **Amazon: no direct add-to-cart** -- App opens the Amazon search results page for the product. User taps Add to Cart once on Amazon. No Amazon Associate account or API credentials required.

---

## Design Vision v2: The Action Card Architecture (CURRENT BUILD)

> **This section supersedes the PIE spec below.** PIE is still the multi-document
> reasoning engine, but its `SmartSuggestion` output is now wrapped as an
> ActionCard in the unified UI. The v2 build also adds: Memory-Augmented Action,
> Now Mode, Focus Mode, Drive Mode, the Activation Coach, the Receipt Index,
> Smart Bundling, and an anti-shame copy audit.

### The mission

We are not building a to-do app. We are building a prosthetic executive function for an ADHD brain. Every design decision serves three rules:

1. **Capture is zero-friction.** A thought becomes a structured action without the user looking at the screen.
2. **Action is one tap.** From "I should do this" to "this is done" must compress to a single button press whenever physically possible.
3. **The system carries the context.** Every task knows where it came from, what's related to it, and what the literal next physical step is -- so the user never has to remember.

### The hero flow (the bar every feature is measured against)

> User (driving): "Hey Siri, ARIA brain dump. I need to buy a replacement piece for the trashcan. I bought it before, there's a receipt in my email."
>
> *(2 seconds of processing)*
>
> A card appears at the top of the Now Feed:
>
> > **Reorder Simplehuman CW1834 hinge**
> > *Bought $12.99 from Amazon on Aug 12, 2025. Megan asked for this last week.*
> > [ Reorder on Amazon -> ]
>
> Tapping the button deep-links straight to the product page. User taps Buy Now. Done in 8 seconds total.

If a feature does not push toward this flow, it does not ship.

### The ActionCard primitive

Every actionable thing -- voice capture, email triage, smart suggestion, overdue task, calendar prep -- renders as the same component. Source-specific types (`CapturedAction`, `TriagedEmail`, `SmartSuggestion`, `Task`) remain. ActionCard is the unified surface layer; converters live in `src/services/actionCards.ts`.

```typescript
export type ActionUrgency = 'now' | 'today' | 'this_week' | 'someday';

export type ActionPayload =
  | { kind: 'open_url'; url: string; label: string }
  | { kind: 'create_calendar'; event: { title: string; date: string | null; durationMinutes: number; notes?: string }; label: string }
  | { kind: 'create_draft'; emailId: string; subject: string; body: string; label: string }
  | { kind: 'reorder_amazon'; asin?: string; query: string; label: string }
  | { kind: 'add_task'; bucket: 'today' | 'upcoming' | 'someday'; label: string }
  | { kind: 'mark_done'; label: string }
  | { kind: 'snooze'; until: string; label: string };

export interface ActionCard {
  id: string;
  source: 'voice' | 'email' | 'calendar' | 'smart_scan' | 'manual';
  title: string;                           // imperative, < 60 chars
  context: string;                         // one sentence with provenance
  urgency: ActionUrgency;
  primaryAction: ActionPayload;
  secondaryActions?: ActionPayload[];
  firstStep?: string | null;
  relatedEmailIds?: string[];
  createdAt: string;
  status: 'pending' | 'in_progress' | 'done' | 'dismissed' | 'snoozed';
  snoozeUntil?: string | null;
  completedAt?: string | null;
}
```

### Tab structure (5 -> 4)

The Suggestions tab is removed in v2. Its content is just ActionCards in the Now Feed -- two surfaces showing the same thing was the cognitive load we're killing.

| Tab          | Replaces             | Purpose                                          |
|--------------|----------------------|--------------------------------------------------|
| **Now**      | Home + Suggestions   | Hero card + ActionCard feed for today            |
| **All**      | Tasks                | Filterable list of every open ActionCard         |
| **Inbox**    | Triage               | Email triage; outputs ActionCards into Now       |
| **Settings** | Settings             | unchanged                                        |

Capture moves from screen-local to global: a `<FloatingMic />` component renders at the App.tsx level so the mic is one tap from any tab.

### Now Mode (default home view)

- **Hero Now Card** at the top: ~60% viewport, the single highest-priority action right now.
- **Compact ActionCard stack** below: today's queue. Swipe right snoozes 1hr. Swipe left dismisses.
- **Slim greeting line** above hero: "Tuesday 2:47pm -- 6 things on your plate"
- Pull-to-refresh triggers a fresh smart scan.

### Memory-Augmented Action

When voice transcript matches a context-hint regex (trigger phrases: `"again"`, `"bought it before"`, `"like last time"`, `"the receipt"`, `"that thing I ordered"`, `"reorder"`, `"the dentist"`, `"the recruiter from"`, `"same as last time"`), the AI does NOT create a generic task. Instead the new service `src/services/contextMiner.ts` runs:

1. Generate a Gmail search query from the utterance.
2. Run the search via gmail.ts.
3. Read the top 3-5 matching threads.
4. Extract structured data (product + ASIN, person + email, event + address, etc.).
5. Build an ActionCard with a deep-link primaryAction.

Cache the last 50 emails locally under `@adhd:emailCache` for sub-3-second lookups. Pre-cache on app open if stale (>30 min).

### Focus Mode

When the user taps "Start" on an ActionCard, transition to a full-bleed black overlay:
- Task title at top
- The literal next physical step in the middle
- 25-min Pomodoro timer ring around a centered DONE button
- Notifications silenced for the session (`Notifications.setNotificationHandler` returns shouldShowAlert=false)
- Built as a modal overlay (`src/components/FocusMode.tsx`), not a separate route.

### Drive Mode

Triggered by Siri shortcut "ARIA brain dump":
- Recording starts immediately, no UI.
- Whisper transcribes -> Claude splits into individual ActionCards.
- TTS confirmation via `expo-speech`: "Got 4 things. First..." then enumerates.
- Cards appear in the Now Feed when the user opens the phone.
- Handled in `src/services/siri.ts` via a new `drive_brain_dump` shortcut action.

### First-Physical-Step generator (Activation Coach)

`src/services/activationCoach.ts` runs daily over pending ActionCards >24h old without a `firstStep`. The AI returns one short sentence -- the literal physical action that breaks the activation barrier:
- "Schedule dentist" -> "Pick up your phone and call (415) 555-0234."
- "Do laundry" -> "Carry the basket to the washer."
- "Reply to Sarah" -> "Open this draft."

Surface the firstStep as an italic line below the context on the ActionCard.

### Receipt / Order Memory Index

Background job in background.ts scans Gmail for order confirmations (Amazon, Chewy, Walmart, Target, Instacart, generic `*@orders.*`, subjects starting with "Your order" or "Order confirmation") and persists a local index under `@adhd:purchases`:

```typescript
export interface PurchaseRecord {
  vendor: string;
  productName: string;
  asin?: string;
  price?: string;
  orderedAt: string;
  emailId: string;
  rawSubject: string;
}
```

Re-scan weekly. The contextMiner consults this index FIRST before live Gmail search.

### Smart Bundling

When the AI detects a cluster (3+ pending cards with the same `primaryAction.kind`), prepend a Bundle hero card:

> **You have 4 things to buy. Want to knock them out?**
> [ Open Bundle -> ]

Tapping opens a focused stack -- one ActionCard at a time with a Next button. Same UI primitive as Focus Mode, stepping through cards instead of through steps within one card.

### Anti-shame copy rules (non-negotiable)

ADHD shame language is a relapse trigger. Audit every user-facing string in the codebase against this table:

| Don't say                       | Do say                                              |
|---------------------------------|-----------------------------------------------------|
| "Overdue 5 days"                | "Still on your list"                                |
| "URGENT" badge                  | "Worth doing today"                                 |
| "You missed this"               | "Picking back up where you left off"                |
| "Failed tasks"                  | "Things to revisit"                                 |
| Empty state "No tasks"          | "Caught up. Nothing pulling at you right now."      |
| Error "Failed to scan"          | "Couldn't pull that up. Pull to refresh."           |
| Notification "Don't forget!"    | "Quick -- want to knock this out?"                  |

### File-structure additions for v2

```
src/
|- components/
|   |- ActionCard.tsx        <- NEW: unified card component (hero + compact modes)
|   |- FloatingMic.tsx       <- NEW: persistent FAB; absorbs CaptureBar logic
|   |- FocusMode.tsx         <- NEW: full-bleed overlay with 25-min timer
|- services/
|   |- actionCards.ts        <- NEW: source-type -> ActionCard converters
|   |- contextMiner.ts       <- NEW: memory-augmented action engine
|   |- activationCoach.ts    <- NEW: first-physical-step generator
|- screens/
|   |- HomeScreen.tsx        <- REBUILT as NowFeed
|   |- (SuggestionsScreen.tsx removed -- merged into NowFeed)
```

### Build phases (canonical order -- match AUTONOMOUS_PROMPT.md)

A. Types + ActionCard primitive + converters + store wiring (~1 hr)
B. Now Feed UI + FloatingMic + 4-tab navigation (~2 hrs)
C. Memory-Augmented Action (contextMiner + email cache + voice routing) (~2 hrs)
D. Focus Mode (~1.5 hrs)
E. Activation Coach (~1 hr)
F. Receipt Index + Drive Mode + Bundling (~1.5 hrs)
G. Anti-shame copy audit (~30 min)
H. Verify (tsc + null-byte preflight) + ship (~30 min)

Phases A-D are mandatory. Skip priority if blocked: G first, then F bundling, then F receipt index, then E.

The entire v2 build is JS/TypeScript only EXCEPT `expo-speech` (Phase F Drive Mode TTS), which is native and forces one EAS build. If Phase F is descoped, ship through Metro on the existing dev IPA -- no build needed.

---

## Feature Spec: Proactive Intelligence Engine (PIE)

### What It Does

PIE cross-references the user's Gmail inbox and upcoming Google Calendar events using Claude, then surfaces a ranked list of "smart suggestions" -- things the user probably hasn't noticed or dealt with. Each suggestion has a one-tap action.

**Examples:**
- "Leo's bachelor party is in 3 weeks. No flights booked -- your inbox has no confirmation from an airline. Search flights?" [Search Google Flights button]
- "You wrote 'pick up replacement Brita filters' in a task. No Amazon order found. Find on Amazon?" [Open Amazon button -- taps straight to the search results page for "Brita filter replacements"]
- "Sarah's dinner is Saturday. It's not on your calendar. Add it?" [Add to Calendar button -- one tap, done]
- "You got an invoice from Acme for $340 due last Friday. No payment email found. Still needs action." [Task button]
- "Dr. Johnson replied 6 days ago -- you haven't responded." [Draft Reply button]

### Suggestion Types and Actions

```typescript
type SuggestionType =
  | 'add_to_calendar'   // event in email/context but not on calendar
  | 'purchase'          // something needs to be bought (Amazon)
  | 'book_travel'       // flight/hotel mentioned but not confirmed
  | 'reply_needed'      // email waiting on a response
  | 'overdue_task'      // past-due item detected
  | 'follow_up';        // general "you should know about this"

interface SmartSuggestion {
  id: string;
  type: SuggestionType;
  title: string;                // Short, action-oriented. "Book flight to Vegas" not "You may need a flight"
  context: string;              // Why: "Found in email from Marcus, May 1"
  urgency: 'high' | 'medium' | 'low';
  action: SuggestionAction;
  sourceEmailId?: string | null;  // Gmail message ID, if applicable
  createdAt: string;
  status: 'pending' | 'actioned' | 'dismissed';
}

type SuggestionAction =
  | { type: 'calendar'; event: { title: string; date: string | null; durationMinutes: number; notes?: string } }
  | { type: 'amazon'; searchQuery: string; productDescription: string }
  | { type: 'flights'; destination: string; departureDateISO: string | null; returnDateISO: string | null }
  | { type: 'draft_reply'; emailId: string; subject: string; draftBody: string }
  | { type: 'task'; taskTitle: string; notes?: string }
  | { type: 'none' };  // informational only
```

### Smart Scan AI Prompt (for `src/services/smartScan.ts`)

Use `claude-sonnet-4-6` for this -- it requires multi-document reasoning.

```
System prompt:
You are an ADHD executive function assistant. You will be given a person's recent emails and upcoming calendar events. Your job is to find things they probably haven't noticed or dealt with: events missing from their calendar, purchases they need to make, travel not yet booked, emails that need a reply, and overdue items.

You are looking for GAPS and OVERLOOKED ITEMS -- things the person likely intended to handle but forgot or hasn't gotten around to. Do not flag things that are clearly already handled (confirmed orders, existing calendar events, emails that already have a response).

Be specific and actionable. If you identify a purchase, name the exact product to search for. If an event is missing from the calendar, include the exact date and time. If a flight needs booking, include the destination city and travel dates.

Current date/time: {ISO datetime with timezone}
User email address: {user email}

Calendar events (next 30 days):
{JSON array of events: id, summary, start.dateTime, end.dateTime, location}

Recent emails (last 7 days, most recent first):
{JSON array of emails: id, from, subject, snippet, receivedAt}

Return ONLY a valid JSON array of SmartSuggestion objects. Return an empty array [] if nothing actionable is found. Never return more than 8 suggestions. Do not invent things that aren't clearly implied by the data.

Schema for each suggestion:
{
  "type": "add_to_calendar" | "purchase" | "book_travel" | "reply_needed" | "overdue_task" | "follow_up",
  "title": "Short imperative title (under 10 words)",
  "context": "One sentence explaining why. Source email or calendar event.",
  "urgency": "high" | "medium" | "low",
  "action": {
    "type": "calendar" | "amazon" | "flights" | "draft_reply" | "task" | "none",
    ... action-specific fields (see schema above)
  },
  "sourceEmailId": "Gmail message ID if applicable, or null"
}
```

### Amazon URL Strategy (no API key required)

When `action.type === 'amazon'`, build an Amazon search URL:

```typescript
// src/services/amazon.ts
import { Linking } from 'react-native';

export function buildAmazonSearchUrl(searchQuery: string): string {
  const encoded = encodeURIComponent(searchQuery);
  return `https://www.amazon.com/s?k=${encoded}`;
}

export async function openAmazonSearch(searchQuery: string): Promise<void> {
  const url = buildAmazonSearchUrl(searchQuery);
  // Try Amazon app first (if installed), falls back to browser
  const appUrl = `amazon://search?keywords=${encodeURIComponent(searchQuery)}`;
  const canOpenApp = await Linking.canOpenURL(appUrl);
  await Linking.openURL(canOpenApp ? appUrl : url);
}
```

### Google Flights URL Strategy

When `action.type === 'flights'`:
```typescript
export function buildFlightsUrl(destination: string, depDate: string | null): string {
  const base = 'https://www.google.com/travel/flights';
  const params = new URLSearchParams({
    q: `flights to ${destination}${depDate ? ` on ${depDate}` : ''}`,
  });
  return `${base}?${params.toString()}`;
}
```

### SuggestionsScreen UI Design

- **Header:** "What needs attention" with a subtle scan timestamp: "Last checked 4 min ago"
- **Pull to refresh** -- triggers a fresh scan (same as background scan but on-demand)
- **Empty state:** "You're all caught up -- nothing needs your attention right now." with a small checkmark animation. Pull to refresh.
- **Suggestion cards** -- ordered by urgency (high first), then recency
- **Each card shows:**
  - Title (bold, 16px+)
  - Context line (gray, 14px, italic) -- "From: Marcus, May 1 -- 'Vegas trip is June 14'"
  - Action button(s) -- max 2 per card, primary action prominent, secondary as text link
  - Urgency indicator (small colored dot: red=high, amber=medium, green=low)
- **Dismiss** -- swipe left to dismiss a card (with a "Not relevant" label). Does not action the item, just removes from feed.
- **After tapping an action:**
  - If "Add to Calendar": creates the event via Calendar API, shows success toast "Added to calendar", card animates out
  - If "Find on Amazon": opens Amazon, card remains but shows "Opened Amazon" label
  - If "Search Flights": opens Google Flights, card remains
  - If "Draft Reply": creates Gmail draft, shows toast "Draft saved to Gmail", card animates out
  - If "Add Task": adds to Zustand task store, shows toast "Added to tasks", card animates out

### Calendar API Extension (needed by PIE)

`src/services/calendar.ts` needs a new function to fetch upcoming events:

```typescript
export async function fetchUpcomingEvents(daysAhead = 30): Promise<CalendarEvent[]>
```

This fetches events from Google Calendar API:
- `GET /calendars/primary/events`
- `timeMin`: now (ISO 8601)
- `timeMax`: now + daysAhead days
- `singleEvents`: true
- `orderBy`: startTime
- Returns: array of simplified event objects (id, summary, start, end, location)

### Zustand Store Changes

Add to the store in `src/store/index.ts`:

```typescript
// State
suggestions: SmartSuggestion[];
lastScanAt: string | null;  // ISO timestamp of last successful scan

// Actions
setSuggestions: (suggestions: SmartSuggestion[]) => void;
dismissSuggestion: (id: string) => void;
actionSuggestion: (id: string) => void;
setLastScanAt: (ts: string) => void;
```

Persist `suggestions` and `lastScanAt` to AsyncStorage under `@adhd:suggestions`.

### Background Task Update

In `src/services/background.ts`, after the email triage step, add a smart scan step:
1. Fetch emails (already done)
2. Fetch upcoming calendar events (new -- call `fetchUpcomingEvents()`)
3. Call `scanForSuggestions(emails, calendarEvents)` from `smartScan.ts`
4. Persist results to `@adhd:suggestions`
5. Fire a local notification if any `urgency: 'high'` suggestions are new

---

## Autonomous Decision-Making Rules

### NEVER stop and ask for approval on:
- Which file to create or edit
- Naming conventions
- Which color, spacing, or font size (use `src/theme.ts`)
- Whether to add error handling (always add it)
- Whether to add a loading state (always add it)
- Minor refactors
- Adding TypeScript types
- Choosing between two reasonable implementations
- Submitting an EAS build

### DO stop (log to PROGRESS_LOG.md and halt) only if:
- EAS build fails with "account not authorized" or certificate error
- Google OAuth fails with "redirect URI mismatch"
- A native module crash on device can't be diagnosed from logs
- EAS build cap (3 per session) is reached
- Curtis needs to physically act on his iPhone

---

## UX & Design System

### Core Principles (non-negotiable)
- **One primary action per screen.**
- **Maximum 2 taps from home to any feature.**
- **Tone: warm, specific, never shame-based.**
- **Cognitive load is the enemy.** When in doubt, remove something.
- **Every completion needs a micro-animation.**

### Typography
- Minimum **16px body text** -- non-negotiable
- High contrast -- WCAG AA minimum (4.5:1)
- Font: Atkinson Hyperlegible (dyslexia-friendly), fallback to system
- Line height: 1.5x body, 1.3x headings

### Color System

| ID | Hex | Description |
|----|-----|-------------|
| `inattention` | `#5B8DB8` | Soft blue |
| `hyperactivity` | `#E8924A` | Warm orange |
| `impulsivity` | `#C4758A` | Dusty rose |
| `emotional` | `#9B7EC8` | Muted violet |
| `working_memory` | `#5BAA8D` | Sage green |
| `time_blindness` | `#D4A843` | Amber |
| `executive` | `#6B9E6B` | Muted green |
| `hyperfocus` | `#B07850` | Warm brown |
| `sleep` | `#6B89B0` | Deep slate blue |

Primary UI color: `colors.purple` from `src/theme.ts`.
Urgency colors: high = `#E8524A` (red), medium = `#D4A843` (amber), low = `#5BAA8D` (green).

### Copy & Tone

| Context | Good | Bad |
|---------|------|-----|
| Suggestion title | "Book flight to Vegas" | "You may need to book a flight" |
| Suggestion context | "From Marcus, May 1: 'Vegas trip is June 14'" | "Email detected potential travel need" |
| Empty state | "You're all caught up. Nothing needs your attention right now." | "No suggestions found." |
| Error | "Couldn't scan right now -- try pulling to refresh." | "Error scanning emails." |
| Action confirm | "Added to your calendar." | "Event created successfully." |

---

## Code Standards

### TypeScript
- All types in `src/types/index.ts` -- no inline type defs in component files
- `interface` for object shapes, `type` for unions/aliases
- Never `any` -- use `unknown` and narrow it

### React Native
- Functional components only
- `StyleSheet.create()` for all styles
- All colors/spacing/typography from `src/theme.ts`
- SafeAreaView at root of every screen

### AI Service
- Voice model: `claude-sonnet-4-6`
- Smart scan model: `claude-sonnet-4-6` (multi-document reasoning required)
- Triage model: `claude-haiku-4-5-20251001`
- Strip markdown fences before JSON.parse()
- Wrap all AI calls in try/catch
- **Do NOT send binary audio to Claude API.**

### Error Handling
- Every async function must have try/catch
- User-visible errors shown in toast/banner -- never silently swallowed

---

## Progress Logging Format

Append to `PROGRESS_LOG.md` after every session:

```markdown
## [Date] -- [Short summary]

### Completed
- [list]

### Decisions Made
- Decision: [what] -- Reason: [why]

### Blockers
- [description] -- Workaround: [what you did]

### Next Session Should Start With
- [specific first action]
```

---

## EAS Build Quick Reference

| Profile | Purpose | Distribution |
|---------|---------|-------------|
| development | Device testing with dev menu | Internal (UDID required) |
| preview | TestFlight-like testing | Internal |
| production | App Store submission | App Store |

Current active profile: **development**
Latest known good IPA: https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa (commit edb3b6af, 2026-05-03)

**Note: The entire PIE feature (smartScan, SuggestionsScreen, Amazon URLs, calendar fetch) is pure JS/TypeScript. No EAS build is required to implement it.**
