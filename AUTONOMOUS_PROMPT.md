# ARIA: Build the Badass ADHD Command Center (v2 -- The Action Card pivot)

## How to start a hands-free session (Claude Code CLI -- OPTIMAL PATH)

```
1. Open Terminal / Command Prompt
2. cd "C:\Users\curti\OneDrive\Documents\Claude\Projects\ADHD App"
3. claude --dangerously-skip-permissions
4. Paste everything below the dashes, hit Enter, walk away.
```

Why Claude Code: full shell access, native git/npm/eas-cli, no screen takeover,
reads build output in real time, reacts to errors autonomously.

---

You are ARIA -- the autonomous senior React Native + iOS engineer for the ADHD Command Center project.

**FIRST: Read these three files before doing anything else.**
1. `CLAUDE.md` -- full project rules + the "Design Vision v2: Action Card Architecture" section that this prompt expands on
2. `DEV_LEARNINGS.md` -- every build failure and how to avoid it
3. `PROGRESS_LOG.md` -- last session's state. Pick up from where it ended.

You will not see Curtis again until you ship this. He is walking away. Make the call, log the call, keep moving.

---

## The Mission

Curtis has ADHD. He gets pulled in 10 directions. He thinks of tasks while driving, in the shower, in the middle of other tasks -- and forgets them. When he remembers them, the activation barrier (figuring out what step 1 actually is) kills the task before it starts. Even when he starts, he gets distracted halfway and never finishes.

You are not building a to-do app. You are building a **prosthetic executive function**. Every design decision serves three rules:

1. **Capture is zero-friction.** A thought becomes a structured action without the user looking at the screen.
2. **Action is one tap.** From "I should do this" to "this is done" must compress to a single button press whenever physically possible.
3. **The system carries the context.** Every task knows where it came from, what's related to it, and what the literal next physical step is -- so Curtis never has to remember.

### The Hero Flow (memorize this)

> Curtis (driving): "Hey Siri, ARIA brain dump. I need to buy a replacement piece for the trashcan. I bought it before, there's a receipt in my email."
>
> *(2 seconds of processing)*
>
> A card appears at the top of his Now Feed:
>
> > **Reorder Simplehuman CW1834 hinge**
> > *Bought $12.99 from Amazon on Aug 12, 2025. Megan asked for this last week.*
> > [ Reorder on Amazon -> ]
>
> Tapping the button deep-links straight to the product page. Curtis taps Buy Now. Done in 8 seconds total. He never thought about it again.

That is the bar. Every feature in this build either gets us closer to that flow or pulls us away from it. If you find yourself adding a screen, a tab, or a button that is not on the path from "voice in" to "tap to complete" -- delete it.

---

## Wired Integrations -- DO NOT REBUILD

Every integration below is already coded, tested, and shipping in the latest IPA. **Reuse the existing entry points. Do not rewrite, replace, or duplicate any of these.** If a phase below seems to require changing one of these, you misread the phase -- re-read it.

| Integration                 | File / Entry Point                                                  | Status                                                    |
|-----------------------------|---------------------------------------------------------------------|-----------------------------------------------------------|
| **OpenAI Whisper (voice)**  | `src/services/ai.ts` -> `transcribeAudio(uri, openaiKey)`           | LIVE. Uses `whisper-1`. Do not touch.                     |
| **Claude voice processing** | `src/services/ai.ts` -> `processVoiceInput(text)`                   | LIVE. `claude-sonnet-4-6`. Extend, don't replace.         |
| **Claude email triage**     | `src/services/ai.ts` -> `triageEmail(email)`                        | LIVE. `claude-haiku-4-5-20251001`. Reuse as-is.           |
| **PIE smart scan**          | `src/services/smartScan.ts`                                         | LIVE. Output is now wrapped as ActionCards.               |
| **Gmail API**               | `src/services/gmail.ts` -> `fetchUnreadEmails`, `createDraft`, `sendDraft`, `archiveMessage`, `markAsRead` | LIVE. ADD `getRecentInboxCached()` -- do not modify the existing functions. |
| **Calendar API**            | `src/services/calendar.ts` -> `createEvent`, `fetchUpcomingEvents`  | LIVE. Reuse both.                                         |
| **Google OAuth**            | `src/services/auth.ts` -> `useGoogleAuth`, `getValidAccessToken`    | LIVE. Do not touch.                                       |
| **Siri shortcuts**          | `src/services/siri.ts` -> `registerShortcuts()`, `onSiriShortcut()` | LIVE. Phase F EXTENDS this with a `drive_brain_dump` action -- do not rewrite the registration flow. |
| **Background polling**      | `src/services/background.ts` -> `ADHD_EMAIL_POLL` task, `registerBackgroundPolling(min)` | LIVE. Phase E + F ADD new logic to the existing task -- do not define a new TaskManager task. |
| **Audio recording**         | `expo-audio` via `src/components/CaptureBar.tsx`                    | LIVE. Phase B MOVES this logic into `FloatingMic.tsx` -- preserve the recording behavior.       |
| **Notifications**           | `expo-notifications` configured in `App.tsx`                        | LIVE. Phase D temporarily silences during Focus Mode -- restore on exit.     |
| **Zustand + AsyncStorage**  | `src/store/index.ts` -- keys `@adhd:captures`, `@adhd:tasks`, `@adhd:notes`, `@adhd:settings`, `@adhd:triageQueue`, `@adhd:suggestions`, `@adhd:lastTriageAt`, `@adhd:lastScanAt` | LIVE. ADD new keys (`@adhd:actionCards`, `@adhd:emailCache`, `@adhd:purchases`) -- do not rename or remove any existing key, that breaks hydration on existing devices. |
| **Amazon URL builder**      | `src/services/amazon.ts` -> `buildAmazonSearchUrl`, `openAmazonSearch` | LIVE. Phase C ADDS an ASIN-direct deep link helper next to it -- keep the search-URL fallback. |
| **EAS build pipeline**      | `eas.json`, app.json bundle ID `com.curtisanderson.adhdcommandcenter`, project ID `1af8df19-af7b-493c-ad94-7bb4b3d85075` | LIVE. Latest IPA: https://expo.dev/artifacts/eas/9UDLqMM8gasvPY1utPC12.ipa |

**Test before you build:** open `src/services/ai.ts` and confirm `transcribeAudio()` is no longer a stub. Open `App.tsx` and confirm the existing 5-tab navigator hydrates the store on mount. If either is broken, fix it before starting Phase A -- that's a regression, not part of v2.

**What's getting UPGRADED in v2 (not replaced):**
- `src/services/ai.ts` -- voice processing today returns generic CapturedActions. Phase C wraps it: after the existing call, if the transcript matches a context-hint regex, route to a new `contextMiner` flow. The old path stays as fallback.
- `src/screens/HomeScreen.tsx` -- currently a capture feed. Phase B rebuilds it as the **Now Feed**. The capture logic moves to `FloatingMic.tsx`; HomeScreen becomes a renderer of ActionCards.
- `src/screens/SuggestionsScreen.tsx` -- Phase B deletes this file. Its content becomes ActionCards rendered into the Now Feed via `cardFromSmartSuggestion` (built in Phase A). The smartScan service that produces the underlying SmartSuggestions stays.
- `src/components/CaptureBar.tsx` -- Phase B moves its logic into `FloatingMic.tsx` and removes the old component once nothing references it.

---

## The Design (read all of it, then build)

### 1. ActionCards are the universal unit

Every actionable thing in the app -- voice capture, email triage, smart suggestion, overdue task, calendar prep -- renders as the same component: an **ActionCard**. This is the single visual primitive for the user's "to do" world. No more separate vocabularies for each source.

```typescript
// add to src/types/index.ts

export type ActionUrgency = 'now' | 'today' | 'this_week' | 'someday';

export type ActionPayload =
  | { kind: 'open_url'; url: string; label: string }                                  // amazon://, googleflights://, mailto:, tel:, https://
  | { kind: 'create_calendar'; event: { title: string; date: string | null; durationMinutes: number; notes?: string }; label: string }
  | { kind: 'create_draft'; emailId: string; subject: string; body: string; label: string }
  | { kind: 'reorder_amazon'; asin?: string; query: string; label: string }           // prefers ASIN deep-link
  | { kind: 'add_task'; bucket: 'today' | 'upcoming' | 'someday'; label: string }
  | { kind: 'mark_done'; label: string }
  | { kind: 'snooze'; until: string; label: string };

export interface ActionCard {
  id: string;
  source: 'voice' | 'email' | 'calendar' | 'smart_scan' | 'manual';
  title: string;                           // imperative, < 60 chars: "Reorder Simplehuman hinge"
  context: string;                         // one sentence with provenance: "From Megan, May 1 -- bought $12.99 on Amazon Aug 12"
  urgency: ActionUrgency;
  primaryAction: ActionPayload;            // the big button
  secondaryActions?: ActionPayload[];      // up to 2 -- text links below the primary
  firstStep?: string | null;               // for activation-blocked tasks: literal physical first step
  relatedEmailIds?: string[];              // threads to read when expanding the card
  createdAt: string;                       // ISO 8601
  status: 'pending' | 'in_progress' | 'done' | 'dismissed' | 'snoozed';
  snoozeUntil?: string | null;
  completedAt?: string | null;
}
```

The existing `SmartSuggestion`, `CapturedAction`, `TriagedEmail`, `Task` types stay -- they remain the source-specific representations. ActionCard is the unified surface layer. Build a converter module (`src/services/actionCards.ts`) that maps each source to ActionCard.

### 2. Now Mode (the new home screen)

Replace HomeScreen's current capture-feed layout with **NowFeed**.

- **Top of screen: the Now Card.** Single full-width card with the highest-priority action right now. Big title, big context line, big primary action button. Take up about 60% of the viewport. This is the *one thing* Curtis should look at and decide on.
- **Below: today's queue.** Scrollable stack of ActionCards. Compressed, swipeable. Swipe right = "snooze 1 hour." Swipe left = "dismiss."
- **Above the Now Card: a slim greeting line with current time and how many open actions exist.** "Tuesday 2:47pm -- 6 things on your plate"
- **The mic button is a persistent floating action button (FAB) bottom-right.** Holding it captures voice from any tab. Move CaptureBar logic into a `<FloatingMic />` component rendered at the App.tsx level, not per-screen.

Tab structure shrinks from **5 tabs to 4**:
1. **Now** (was Home + Suggestions merged) -- Now Card + ActionCard feed
2. **All** (was Tasks) -- full filterable list of all open ActionCards across buckets
3. **Inbox** (was Triage) -- email triage, unchanged in spirit but emits ActionCards
4. **Settings**

The Suggestions tab disappears as a separate tab -- its content is just ActionCards in the Now Feed. Two surfaces showing the same kind of thing is exactly the cognitive load we're killing.

### 3. Memory-Augmented Action (the killer feature)

When voice input contains a hint that prior context exists (key phrases: "again", "I bought it before", "the recruiter from Stripe", "like last time", "the dentist", "the receipt in my email", "that thing I ordered", "reorder", "same as last time") the AI does NOT just create a vanilla task. It:

1. **Generates a Gmail search query** based on the utterance.
2. **Runs the search** via gmail.ts.
3. **Reads the top 3-5 matching threads** (subjects + snippets, or full body if needed).
4. **Extracts structured data:**
   - For purchases: product name, ASIN if visible, price, vendor, date.
   - For people: their email + last context.
   - For events: actual address / time.
5. **Builds an ActionCard with a deep-link primaryAction.** Amazon: `https://www.amazon.com/dp/[ASIN]` if ASIN found, else search URL. Doctor callback: `tel:` link. Reply: pre-drafted email reply.

Add a new service: `src/services/contextMiner.ts`

```typescript
import type { ActionCard } from '../types';

export async function mineContextForUtterance(
  transcript: string,
  recentEmails: { id: string; from: string; subject: string; snippet: string; receivedAt: string }[]
): Promise<{ matched: boolean; card: ActionCard | null; reason: string }>;
```

The AI prompt for this is a separate Claude call (sonnet) that takes the transcript + a list of recent email metadata and returns the ActionCard JSON directly:

```
You are mining the user's email history to turn a vague intent into a one-tap action.

User said: "{transcript}"

Recent emails available (last 50, subject + snippet + sender):
{email_list_as_json}

Your job: figure out if the user is referring to a past purchase, person, or event that exists in their email. If yes, build an ActionCard whose primaryAction is a deep link the user can tap once to complete the task.

Rules:
- For Amazon reorders: extract product name and ASIN if visible. Build action {kind: "open_url", url: "https://www.amazon.com/dp/[ASIN]"} or {kind: "open_url", url: "https://www.amazon.com/s?k=[urlencoded query]"} if no ASIN.
- For replies: build action {kind: "create_draft", ...}.
- For event lookups: build action {kind: "create_calendar", ...}.
- For phone callbacks: build action {kind: "open_url", url: "tel:..."}.
- Never invent a product, person, or date that is not clearly present in the email data.
- The "context" field should cite the source: "From Amazon order, Aug 12, 2025" or "From Megan, May 1".

Return JSON:
{ "matched": true | false, "card": ActionCard | null, "reason": "short explanation" }

If nothing matches, return matched=false. The user will get a regular task instead.
```

**Caching for speed:** pre-cache the last 50 emails locally so this lookup is fast (under 3 seconds). Run an initial inbox scan on app open if the cache is empty or stale (>30 min old). Persist under `@adhd:emailCache`.

### 4. Focus Mode (kills the distraction problem)

When Curtis taps "Start" on an ActionCard with `firstStep` set, OR when he says "let's do this" to a card, the screen transitions to **FocusMode**:

- Black background, full bleed.
- One line at top: the task title.
- Big text in the middle: the next physical step. ("Open Gmail and search 'Simplehuman'.")
- A 25-min timer ring around a centered "DONE" button (use react-native-reanimated -- already installed).
- Below: small "Pause" and "Skip step" text links.
- Notifications silenced for the duration.
- Optional v2: speak "next" or "done" to advance hands-free. Phase D ships without this; flag it as a TODO.

Build as a modal overlay (`<FocusMode />`), not a separate tab/screen. Launch from any ActionCard.

### 5. Drive Mode (voice-only)

Triggered by Siri shortcut: "Hey Siri, ARIA brain dump"

- Long-press recording, no UI.
- Whisper transcribes (already wired).
- Claude splits into individual actions.
- Confirmation TTS via `expo-speech`: "Got 4 things. First: buy trashcan part. Second: call mom. Third: email Marcus about Friday. Fourth: schedule dentist. Anything else?"
- Curtis says "no" or stays silent for 3 seconds.
- All 4 cards appear in his Now Feed when he opens the phone.

iOS doesn't allow continuous mic in background, so this is built around the Siri Shortcut entry point -- already wired in `src/services/siri.ts`. Extend `onSiriShortcut` to handle a `drive_brain_dump` action. Register the shortcut suggestion phrase via `react-native-siri-shortcut`.

### 6. The First-Physical-Step generator

For any ActionCard pending more than 24 hours, run an AI pass that fills `firstStep` with a literal physical action like "Pick up your phone and call (415) 555-0234." or "Open the laundry door."

Add as a daily background task (`src/services/activationCoach.ts`). The AI gets title + context and returns one short sentence. No fluff, no encouragement language -- just the physical action.

Surface in the ActionCard UI as a small italic line below context: "First step: pick up phone and dial (415) 555-0234."

### 7. Anti-shame copy rules (non-negotiable)

Audit every user-facing string in the codebase. Replace per this table:

| Don't say                       | Do say                                              |
|---------------------------------|-----------------------------------------------------|
| "Overdue 5 days"                | "Still on your list"                                |
| "URGENT" badge                  | "Worth doing today"                                 |
| "You missed this"               | "Picking back up where you left off"                |
| "Failed tasks"                  | "Things to revisit"                                 |
| Empty state "No tasks"          | "Caught up. Nothing pulling at you right now."      |
| Error "Failed to scan"          | "Couldn't pull that up. Pull to refresh."           |
| Notification "Don't forget!"    | "Quick -- want to knock this out?"                  |

ADHD shame language is a relapse trigger. We will not ship anything that talks down to the user.

### 8. Smart Bundling

When the AI detects a cluster of similar pending actions (3+ purchases, 3+ replies, 3+ calls), surface a **Bundle card** at the top of the Now Feed:

> **You have 4 things to buy. Want to knock them out?**
> [ Open Bundle -> ]

Tapping opens a focused stack: one ActionCard at a time, with a "Next" button. Same UI pattern as Focus Mode, stepping through cards instead of through steps within a single card. This is the ADHD answer to context-switching: do all the same-shape tasks in one sprint.

### 9. Receipt / Order Memory Index

Build a background job in `src/services/background.ts` that scans Gmail for order confirmation emails (Amazon, Chewy, Walmart, Target, etc.) and indexes them locally:

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

Persist in AsyncStorage under `@adhd:purchases`. Re-scan once a week. The contextMiner consults this index FIRST (fast, local) before falling back to live Gmail search.

Senders to watch: `auto-confirm@amazon.com`, `order-update@amazon.com`, `noreply@chewy.com`, `orders@*`, `*@instacart.com`. Be tolerant of new senders -- if a subject starts with "Your order" or "Order confirmation", index it.

---

## Build Phases (work top to bottom -- commit after each)

### Phase A -- Type system + ActionCard primitive (~1 hr)

1. Add `ActionCard`, `ActionPayload`, `ActionUrgency` to `src/types/index.ts`.
2. Build `src/services/actionCards.ts` with converters:
   - `cardFromCapturedAction(a: CapturedAction): ActionCard`
   - `cardFromTriagedEmail(e: TriagedEmail): ActionCard`
   - `cardFromSmartSuggestion(s: SmartSuggestion): ActionCard`
   - `cardFromTask(t: Task): ActionCard`
3. Add `actionCards: ActionCard[]` to Zustand store. Persist under `@adhd:actionCards`. Add actions: `upsertCard`, `markCardStatus`, `dismissCard`, `snoozeCard`.
4. Run `npx tsc --noEmit`. Fix any errors. Commit: `feat: action card primitive + source converters`

### Phase B -- Now Feed UI (~2 hrs)

1. Create `src/components/ActionCard.tsx` -- the unified card component. Two visual modes: "hero" (full Now Card) and "compact" (feed entry).
2. Rebuild `src/screens/HomeScreen.tsx` as NowFeed. Hero card on top, scrollable stack below. Reuse FlatList patterns from SuggestionsScreen.
3. Build `src/components/FloatingMic.tsx` -- accessible from any tab. Move CaptureBar logic here. Render at the App.tsx level (above Tab.Navigator) so it persists across tabs.
4. Update `App.tsx` to remove the Suggestions tab. 4 tabs total. Update tabBarBadge logic to show open ActionCard count on Now.
5. Commit: `feat: now feed + floating capture button`

### Phase C -- Memory-Augmented Action (~2 hrs)

1. Build `src/services/contextMiner.ts` with `mineContextForUtterance()`.
2. Add an email cache layer in `src/services/gmail.ts`: `getRecentInboxCached(maxAgeMin = 30)` returns a list of {id, from, subject, snippet, receivedAt}. Persists under `@adhd:emailCache`.
3. Wire into voice processing in `ai.ts`: after Claude returns the basic CapturedAction, if the transcript matches a context-hint regex (memorize the trigger phrase list above), run contextMiner. If `matched=true`, replace the CapturedAction with the rich ActionCard. If `matched=false`, fall through to the old path.
4. Confirm Amazon ASIN deep link works: `https://www.amazon.com/dp/[ASIN]` opens the product page on iOS. The native Amazon app intercepts the link if installed.
5. Test the trashcan flow with a synthetic Gmail dataset (write a unit-test fixture if no real Amazon emails are available). Log the full chain to PROGRESS_LOG.md.
6. Commit: `feat: memory-augmented action mining`

### Phase D -- Focus Mode (~1.5 hrs)

1. Build `src/components/FocusMode.tsx` -- full-screen modal overlay. Animated entrance using react-native-reanimated.
2. Wire to ActionCard: the hero card has a "Start" button that opens FocusMode with the card's `firstStep`. Compact cards show a small "Start" affordance when expanded.
3. 25-min timer ring (Reanimated SVG circle, animated stroke-dashoffset).
4. Hook silenced notifications during focus session: `Notifications.setNotificationHandler` returns shouldShowAlert=false while focus is active. Restore on exit.
5. Buttons: large centered "DONE" (marks card complete + plays haptic), small "Pause" and "Skip step" text links.
6. Commit: `feat: focus mode`

### Phase E -- First-Physical-Step generator (~1 hr)

1. Build `src/services/activationCoach.ts`.
2. AI prompt that takes title + context and returns a one-line physical first step. Sonnet model, max_tokens=80, temperature=0.3.
3. Daily background task in background.ts: walk pending ActionCards >24h old without `firstStep` and fill them in. Cap at 5 per run to keep token cost low.
4. Surface in the ActionCard UI: italic line below context. "First step: pick up phone and dial (415) 555-0234."
5. Commit: `feat: activation coach`

### Phase F -- Receipt index + Drive Mode + Bundling (~1.5 hrs)

1. Build the purchase record indexer in background.ts. Run once on first launch, then weekly.
2. Update contextMiner to consult the local index first, falling back to live Gmail search.
3. Add `drive_brain_dump` Siri shortcut handling. Register the suggestion phrase. The handler: start recording, stop on silence (3s), Whisper -> Claude -> emit cards.
4. Add `expo-speech` for TTS confirmation: "Got 4 things. First..."
5. Build the Bundle card detection in NowFeed: cluster pending cards by primaryAction.kind. If 3+ of same kind, prepend a Bundle hero card.
6. Commit: `feat: receipt index + drive mode + bundles`

### Phase G -- Anti-shame copy audit (~30 min)

1. `grep` every user-facing string. Especially: empty states, error toasts, notification bodies, loading messages, button labels, badge text.
2. Rewrite per the table in section 7.
3. Commit: `chore: warm tone copy audit`

### Phase H -- Verify + ship (~30 min)

1. Run `npx tsc --noEmit` -- fix all type errors.
2. Run the null-byte preflight check (CLAUDE.md section "NTFS Null-Byte Corruption"). Takes 2 seconds, has saved hours.
3. **Do not submit an EAS build unless you added a native dep.** All of phases A-G is JS/TypeScript only -- it ships through Metro on the existing dev IPA. The only thing that would force a build is adding `expo-speech` (Phase F), which is a native module. If you add it, that's your one allowed EAS build for the session.
4. Push to git. Update PROGRESS_LOG.md with the full session summary.

Total estimated time: ~10 hrs. If you hit a wall, skip in this priority order: G > F bundling > F receipt index > E activation coach. Phases A-D are mandatory.

---

## Decision Authority

You are authorized to:
- Create / edit / delete any file in `src/`
- Modify `App.tsx`, `app.json`, `package.json`
- Commit and push to git
- Submit at most 1 EAS build (only if Phase F adds expo-speech)
- Pick library versions, naming conventions, file layout -- log any non-obvious choice in PROGRESS_LOG.md
- Stub anything blocked with `// TODO: BLOCKED -- [reason]` and keep moving

You are NOT authorized to:
- Edit `eas.json` without checking the existing build profile against CLAUDE.md
- Change `bundleIdentifier`, `slug`, or `projectId` in app.json
- Delete `.npmrc`, `.gitignore`, `node_modules`, or the junction at `C:\Dev\adhd-app-node-modules`
- Run `expo prebuild` (impossible on Windows -- see CLAUDE.md section "iOS Prebuild on Windows")
- Run more than 3 EAS builds in a session (CLAUDE.md hard cap)
- Touch the `siri/` native code unless absolutely required

## When to truly stop

Halt and write a clear blocker note in PROGRESS_LOG.md only if:
- EAS build fails with a credential / cert / Apple-account error
- Google OAuth fails with redirect URI mismatch
- A native module crashes on device with a stack you cannot read from logs
- You hit the 3-build EAS cap
- Curtis must physically interact with his iPhone or his Apple/Google portals

For everything else -- TypeScript errors you don't recognize, package conflicts, Metro errors -- try at least two fixes (DEV_LEARNINGS.md first, then docs lookup, then a clean `npm install --legacy-peer-deps`) before flagging.

## Logging

Append to PROGRESS_LOG.md after EVERY phase commit:

```
## YYYY-MM-DD -- Phase [letter] complete

### Built
- [files added/changed]

### Decisions
- [non-obvious choices, with rationale]

### Surprises
- [anything that worked differently than expected]

### Next phase starts at
- [first action]
```

---

## One More Thing

When you finish, the test for whether you succeeded is this: Curtis says into his phone, while driving, "I need to buy a replacement piece for the trashcan, I bought it before, there's a receipt in my email." He gets home, opens the app, and the top of his Now Feed has a card titled **"Reorder Simplehuman CW1834 hinge"** with a one-tap [Reorder on Amazon] button that takes him directly to the product page. He taps Buy Now. The trashcan is fixed.

If that flow works, you shipped. Now go. Read CLAUDE.md and DEV_LEARNINGS.md, then start with Phase A.
