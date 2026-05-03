# ADHD Command Center — iOS App Build Specification

**Project name:** ADHD Command Center  
**Platform:** Native iOS (Swift / SwiftUI)  
**Integrations:** Gmail API, Google Calendar API, OpenAI API (or Anthropic Claude API)  
**Siri:** Deep Siri Shortcuts integration via `AppIntents` framework  

---

## 1. What This App Does

ADHD Command Center is a personal executive-function layer for your iPhone. It has two jobs:

1. **Capture mode** — You speak a thought to Siri at any time, even with the phone locked. The app's AI turns your raw voice into a structured item and routes it to the right place: a Gmail draft, a Google Calendar event, a to-do, or just a saved note.

2. **Triage mode** — When new emails arrive, the app reads them, runs them through AI, and surfaces a short list of suggested actions (reply with a draft, add to calendar, snooze, archive). You tap one button per email and move on.

Both modes are designed for minimal friction — the goal is zero cognitive overhead at capture time and a one-tap decision on every incoming item.

---

## 2. Core Features

### 2.1 Siri Voice Capture
- Triggered by "Hey Siri, log a thought" (or any phrase you customize)
- Works from the lock screen with no unlocking required
- Transcribes your voice, sends to AI for classification and structuring
- Confirms back to you via Siri voice ("Got it — added to your calendar for Thursday at 2pm")

### 2.2 AI Classification Engine
Every voice input is classified by AI into one or more of:

| Type | Example input | Output |
|------|--------------|--------|
| **Calendar event** | "Remind me I have a dentist appointment Friday at 3" | Creates Google Calendar event |
| **Email draft** | "Draft an email to mom about Thanksgiving plans" | Creates Gmail draft, opens for review |
| **Task / to-do** | "I need to pick up my prescription" | Saves to in-app task list |
| **Note / idea** | "Random idea: what if I redesigned the living room" | Saves to in-app notes |
| **Ambiguous** | "Call back Dr. Smith" | AI picks most likely action, confirms with you |

### 2.3 Gmail Draft Creation
- OAuth2 connection to your Gmail account
- AI drafts the email body when you describe what you want to say
- Draft saved to Gmail (visible in Gmail app immediately)
- You review and send — the app never sends without your approval

### 2.4 Google Calendar Integration
- OAuth2 connection to your Google Calendar
- AI extracts date, time, title, duration, and optional notes from your voice
- Creates event directly; you can view/edit before confirming
- Handles fuzzy language: "next Tuesday afternoon" → Wednesday 2pm

### 2.5 Email Triage Feed
- Polls Gmail inbox on a schedule (every 15 minutes, or push via Gmail API watch)
- Unread/unprocessed emails are passed to AI for analysis
- For each email, AI returns:
  - 1-line summary (what this email is actually about)
  - Priority level: 🔴 urgent / 🟡 needs action / 🟢 FYI only
  - Up to 3 suggested actions (see Section 4 for full prompt)
- You swipe through emails and tap one action — done

### 2.6 In-App Inbox (Capture History)
- Every captured item (voice or email-triggered) is logged in a scrollable feed
- Each item shows: source, timestamp, AI summary, and routing destination
- Items can be re-routed, edited, or deleted
- "Pending" items (things that need follow-up) are pinned at the top

---

## 3. App Architecture

```
┌─────────────────────────────────────────────────┐
│                   iOS App                        │
│                                                  │
│  ┌──────────┐   ┌──────────┐   ┌─────────────┐  │
│  │  Siri    │   │  Email   │   │  Home Feed  │  │
│  │Shortcuts │   │  Triage  │   │  (Inbox)    │  │
│  └────┬─────┘   └────┬─────┘   └──────┬──────┘  │
│       │              │                │          │
│       └──────────────▼────────────────┘          │
│                  AI Engine                        │
│              (OpenAI / Claude)                   │
│                      │                           │
│        ┌─────────────┼─────────────┐             │
│        ▼             ▼             ▼             │
│   Gmail API    Google Cal API   Local DB         │
│   (drafts,     (events)         (tasks, notes)   │
│   inbox read)                                    │
└─────────────────────────────────────────────────┘
```

### Tech Stack
- **Language:** Swift 5.9+
- **UI:** SwiftUI
- **Siri/Shortcuts:** `AppIntents` framework (iOS 16+)
- **Background refresh:** `BackgroundTasks` framework
- **Gmail:** Google APIs Swift client (`GoogleAPIClientForREST`)
- **Google Calendar:** Same Google APIs client
- **AI:** OpenAI `gpt-4o` via REST API, or Anthropic `claude-haiku-3-5` (cheaper/faster for triage)
- **Local storage:** Core Data or SwiftData
- **Auth:** OAuth2 via `AppAuth` library (Google sign-in)
- **Keychain:** `KeychainSwift` for storing tokens securely

---

## 4. AI System Prompts

### 4.1 Voice Capture System Prompt

```
You are the executive function AI for someone with ADHD. Your job is to take raw, 
unfiltered voice input and transform it into a structured action.

The user speaks naturally — they may ramble, be incomplete, jump topics, or not 
know exactly what they want. Your job is to figure out their intent and structure it.

RULES:
- Always respond with a valid JSON object (no markdown, no explanation, just JSON)
- If the input contains multiple distinct items, return an array of action objects
- Prefer calendar over tasks when a specific date/time is mentioned
- Prefer email draft over tasks when a person's name + communication intent is present
- When date/time is ambiguous (e.g. "soon", "later"), default to TASK, not calendar
- Never make up details. If something is unclear, flag it in the "needs_clarification" field
- Speak to the user in the second person in the "confirmation_text" field
- Keep confirmation_text short (under 15 words) — it will be read aloud by Siri

OUTPUT SCHEMA:
{
  "actions": [
    {
      "type": "calendar_event" | "gmail_draft" | "task" | "note",
      "title": "Short title for the item",
      "body": "Full content / description / email body (if applicable)",
      "date": "ISO 8601 datetime string, or null",
      "duration_minutes": number or null,
      "recipient_name": "Name of email recipient, or null",
      "recipient_email": "Email address if known, or null",
      "priority": "high" | "medium" | "low",
      "needs_clarification": "A short question to ask the user if something is missing, or null",
      "confirmation_text": "Short spoken confirmation for Siri to read back"
    }
  ]
}

EXAMPLES:

Input: "I have a meeting with Sarah from marketing on Tuesday at 10am about the Q3 budget"
Output:
{
  "actions": [{
    "type": "calendar_event",
    "title": "Meeting with Sarah — Q3 Budget",
    "body": "Meeting with Sarah from marketing to discuss Q3 budget.",
    "date": "[next Tuesday at 10:00 AM in ISO 8601]",
    "duration_minutes": 60,
    "recipient_name": null,
    "recipient_email": null,
    "priority": "medium",
    "needs_clarification": null,
    "confirmation_text": "Added to your calendar — Tuesday at 10am with Sarah."
  }]
}

Input: "I need to email Dr. Johnson about rescheduling my appointment, something came up"
Output:
{
  "actions": [{
    "type": "gmail_draft",
    "title": "Reschedule appointment — Dr. Johnson",
    "body": "Hi Dr. Johnson,\n\nI wanted to reach out because something has come up and I need to reschedule my upcoming appointment. I apologize for any inconvenience and would appreciate any available times that work for your schedule.\n\nThank you,\nCurtis",
    "date": null,
    "duration_minutes": null,
    "recipient_name": "Dr. Johnson",
    "recipient_email": null,
    "priority": "medium",
    "needs_clarification": "Do you know Dr. Johnson's email address?",
    "confirmation_text": "Draft saved to Gmail. You still need to add their email."
  }]
}

Input: "Pick up dog food, also I think there's a vet appointment this week I haven't confirmed yet"
Output:
{
  "actions": [
    {
      "type": "task",
      "title": "Pick up dog food",
      "body": null,
      "date": null,
      "duration_minutes": null,
      "recipient_name": null,
      "recipient_email": null,
      "priority": "medium",
      "needs_clarification": null,
      "confirmation_text": "Task added."
    },
    {
      "type": "task",
      "title": "Confirm vet appointment this week",
      "body": "Check if there's a vet appointment scheduled this week and confirm it.",
      "date": null,
      "duration_minutes": null,
      "recipient_name": null,
      "recipient_email": null,
      "priority": "high",
      "needs_clarification": null,
      "confirmation_text": "Added two tasks — including a reminder to confirm the vet."
    }
  ]
}
```

---

### 4.2 Email Triage System Prompt

```
You are an ADHD email assistant. Your job is to read an incoming email and tell the 
user exactly what it is, why it matters (or doesn't), and what they should do about it.

The user has ADHD. They need:
- Ruthless brevity — no fluff, no restating what the email says
- Actionability — what do they actually need to DO, if anything?
- Low cognitive load — they should be able to decide in 3 seconds

RULES:
- Always respond with valid JSON only (no markdown, no explanation)
- The summary must be one sentence, under 20 words
- Actions must be concrete and specific (not "consider replying")
- If an email requires no action, say so clearly — don't manufacture tasks
- Draft replies should be complete and ready to send with minimal editing
- If a calendar event is suggested, extract date/time from the email
- Urgency must be honest — do NOT mark everything as urgent

PRIORITY LEVELS:
- "urgent" = requires action TODAY or has a deadline within 48 hours
- "action_needed" = requires a response or follow-up, no immediate deadline
- "fyi" = informational, no reply or action needed
- "noise" = newsletter, promo, notification — safe to archive

OUTPUT SCHEMA:
{
  "summary": "One-sentence plain-English summary of the email",
  "priority": "urgent" | "action_needed" | "fyi" | "noise",
  "priority_reason": "One short phrase explaining why (e.g. 'deadline tomorrow', 'needs your approval')",
  "suggested_actions": [
    {
      "action_type": "reply" | "calendar_event" | "task" | "archive" | "snooze",
      "label": "Short button label (max 5 words)",
      "draft_body": "Full reply text if action_type is 'reply', otherwise null",
      "calendar_event": {
        "title": "Event title",
        "date": "ISO 8601 datetime or null",
        "duration_minutes": 60
      } or null,
      "task_text": "Task description if action_type is 'task', otherwise null",
      "snooze_until": "ISO 8601 datetime for snooze, or null"
    }
  ]
}

EXAMPLES:

Email: "Subject: Invoice #4821 — Payment Due May 10
Hi Curtis, just a reminder that invoice #4821 for $340 is due on May 10th. Please let 
us know if you have any questions. — Acme Supplies"

Output:
{
  "summary": "Invoice for $340 due May 10 from Acme Supplies.",
  "priority": "urgent",
  "priority_reason": "payment deadline in 2 days",
  "suggested_actions": [
    {
      "action_type": "task",
      "label": "Pay invoice",
      "draft_body": null,
      "calendar_event": null,
      "task_text": "Pay Acme Supplies invoice #4821 — $340 due May 10"
    },
    {
      "action_type": "archive",
      "label": "Archive",
      "draft_body": null,
      "calendar_event": null,
      "task_text": null
    }
  ]
}

Email: "Subject: Team lunch Thursday!
Hey everyone, we're doing a team lunch this Thursday at noon at Rosario's. RSVP by 
Wednesday. Hope to see you all there!"

Output:
{
  "summary": "Team lunch this Thursday at noon — RSVP needed by Wednesday.",
  "priority": "action_needed",
  "priority_reason": "RSVP deadline Wednesday",
  "suggested_actions": [
    {
      "action_type": "calendar_event",
      "label": "Add to calendar",
      "draft_body": null,
      "calendar_event": {
        "title": "Team Lunch at Rosario's",
        "date": "[ISO 8601 for this Thursday at noon]",
        "duration_minutes": 60
      },
      "task_text": null
    },
    {
      "action_type": "reply",
      "label": "Reply yes",
      "draft_body": "Hey! Count me in — see everyone Thursday at noon at Rosario's. 🍽️",
      "calendar_event": null,
      "task_text": null
    },
    {
      "action_type": "archive",
      "label": "Skip it",
      "draft_body": null,
      "calendar_event": null,
      "task_text": null
    }
  ]
}
```

---

## 5. Siri Shortcuts / AppIntents Implementation

### Intents to implement:

```swift
// 1. Log a thought
struct LogThoughtIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a Thought"
    static var description = IntentDescription("Capture anything on your mind")
    
    @Parameter(title: "What's on your mind?")
    var thought: String
    
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let result = await AIEngine.processVoiceInput(thought)
        await RouteActions.execute(result.actions)
        return .result(dialog: IntentDialog(result.actions.first?.confirmation_text ?? "Got it."))
    }
}

// 2. Quick task
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Add a Task"
    
    @Parameter(title: "Task")
    var task: String
    
    func perform() async throws -> some IntentResult & ProvidesDialog {
        await LocalDB.saveTask(task)
        return .result(dialog: "Task added.")
    }
}

// 3. Open triage
struct OpenTriageIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Email Triage"
    
    func perform() async throws -> some IntentResult {
        // Opens the app to the triage screen
        return .result()
    }
}
```

**Siri phrases to register:**
- "Log a thought" → LogThoughtIntent
- "Add a task [task]" → AddTaskIntent  
- "Show my emails" → OpenTriageIntent
- "What do I need to do?" → Opens the home feed

---

## 6. Screen Map

```
TabBar
├── 🏠 Home Feed
│   ├── Pinned items (needs action)
│   ├── Recent captures (chronological)
│   └── Quick-add bar at bottom
│
├── 📥 Email Triage
│   ├── Triage card stack (swipeable)
│   ├── Each card: summary + priority badge + action buttons
│   └── "All caught up" state
│
├── ✅ Tasks
│   ├── Today section
│   ├── Upcoming section
│   └── Someday section
│
└── ⚙️ Settings
    ├── Google account (Gmail + Calendar)
    ├── AI provider + API key
    ├── Siri shortcuts setup
    ├── Email triage frequency
    └── Notification preferences
```

---

## 7. Google API Scopes Required

```
https://www.googleapis.com/auth/gmail.modify        // Read + draft emails
https://www.googleapis.com/auth/gmail.compose        // Create drafts
https://www.googleapis.com/auth/calendar             // Read + write calendar
https://www.googleapis.com/auth/calendar.events      // Create/edit events
```

---

## 8. Build Phases

### Phase 1 — Core Capture (MVP)
- [ ] Xcode project setup, SwiftUI shell, tab bar
- [ ] Google OAuth2 sign-in (Gmail + Calendar scopes)
- [ ] OpenAI/Claude API integration
- [ ] Siri Shortcut: "Log a thought" → AI classification → routes to Gmail draft or Calendar
- [ ] Home feed showing captured items

### Phase 2 — Email Triage
- [ ] Gmail inbox polling (or push via Gmail watch API)
- [ ] Email triage AI prompt integration
- [ ] Triage card UI with action buttons
- [ ] Reply drafts sent back to Gmail as drafts

### Phase 3 — Tasks & Polish
- [ ] In-app task list with today/upcoming/someday views
- [ ] Background refresh for email triage
- [ ] Push notifications for urgent emails
- [ ] Widget: today's tasks + pending triage count
- [ ] Lock screen widget

### Phase 4 — Refinement
- [ ] Onboarding flow (Google sign-in, API key entry, Siri setup walkthrough)
- [ ] Settings screen
- [ ] ADHD-friendly UX tweaks (large tap targets, high contrast, minimal animations)
- [ ] TestFlight beta distribution

---

## 9. Key Implementation Notes

**On AI latency:** Voice capture responses need to feel instant. Use streaming where possible, or show a subtle "thinking…" animation. Never block Siri's response — always return a quick confirmation, then process in background if needed.

**On Gmail drafts:** Always save as draft, never auto-send. The user with ADHD needs a review step. The draft should open in the Gmail app automatically after creation.

**On date parsing:** Pass the user's current local time to the AI in every prompt so it can resolve relative dates ("tomorrow", "this Friday", "in an hour") correctly.

**On offline resilience:** Queue captures locally if there's no network. Process and route when connectivity returns. Never lose a captured thought.

**On privacy:** API keys stored in iOS Keychain. No email content or voice transcripts stored server-side. AI calls are stateless per-request.

**On ADHD UX principles:**
- Reduce choices at every step — fewer options = less decision fatigue
- Confirm actions verbally via Siri so the user doesn't have to check the phone
- Make the "do nothing" path obvious — not every email needs action
- Use color sparingly but meaningfully (red = urgent, not just decorative)
- Keep notifications minimal — only interrupt for truly urgent items

---

## 10. API Reference Snippets

### Create a Gmail Draft
```swift
func createGmailDraft(to: String?, subject: String, body: String) async throws {
    let service = GTLRGmailService()
    service.authorizer = currentUser.fetcherAuthorizer()
    
    let message = GTLRGmail_Message()
    let rawMessage = buildMimeMessage(to: to, subject: subject, body: body)
    message.raw = rawMessage.base64EncodedString()
    
    let draft = GTLRGmail_Draft()
    draft.message = message
    
    let query = GTLRGmailQuery_UsersDraftsCreate.query(withObject: draft, userId: "me")
    try await service.execute(query)
}
```

### Create a Google Calendar Event
```swift
func createCalendarEvent(title: String, startDate: Date, durationMinutes: Int, notes: String?) async throws {
    let service = GTLRCalendarService()
    service.authorizer = currentUser.fetcherAuthorizer()
    
    let event = GTLRCalendar_Event()
    event.summary = title
    event.descriptionProperty = notes
    
    let start = GTLRCalendar_EventDateTime()
    start.dateTime = GTLRDateTime(date: startDate)
    start.timeZone = TimeZone.current.identifier
    event.start = start
    
    let end = GTLRCalendar_EventDateTime()
    end.dateTime = GTLRDateTime(date: startDate.addingTimeInterval(TimeInterval(durationMinutes * 60)))
    end.timeZone = TimeZone.current.identifier
    event.end = end
    
    let query = GTLRCalendarQuery_EventsInsert.query(withObject: event, calendarId: "primary")
    try await service.execute(query)
}
```

---

*This document was generated as a development specification. Hand it to an AI coding tool (Cursor, Copilot, or Claude Code) or a developer to begin implementation. Start with Phase 1.*
