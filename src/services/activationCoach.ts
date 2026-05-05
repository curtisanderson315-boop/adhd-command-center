/**
 * Activation Coach — generates the literal physical first step for stalled
 * ActionCards. ADHD's activation barrier is "I don't know what step 1
 * actually is." This service answers that question in one short sentence.
 *
 * Runs as part of the existing background poll (background.ts) — does NOT
 * define a new TaskManager task. Walks pending ActionCards >24h old without
 * a firstStep, fills 5 per run to keep token cost predictable.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActionCard } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

const ACTION_CARDS_KEY = '@adhd:actionCards';

const SYSTEM_PROMPT = `You write one-sentence physical first steps for people with ADHD.

The user has a task they've been avoiding. The activation barrier — "what's step 1?" — is what's keeping them stuck. Your job: tell them the literal physical action that breaks the barrier.

RULES:
- One sentence. Under 18 words.
- Imperative voice. "Pick up", "Open", "Walk to", "Tap", "Type", "Dial".
- Physical or screen-tappable, not abstract. Never "decide" or "consider".
- No encouragement language. No "you've got this", no exclamation marks.
- If a phone number is in the title/context, include it: "Pick up your phone and dial (415) 555-0234."
- If an app/email/URL is implied, name it: "Open Gmail and search 'Simplehuman'."
- For physical-world tasks, name the object: "Walk to the laundry room. Open the washer door."

Respond with ONLY the sentence. No prose, no quotes, no JSON.`;

const MAX_PER_RUN = 5;
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a single first-step sentence for one card.
 * Returns null on any failure (caller silently skips).
 */
async function generateFirstStep(
  title: string,
  context: string,
  anthropicKey: string
): Promise<string | null> {
  const userMessage = `Task: ${title}
Context: ${context}

Give the user the literal physical first step.`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    if (!res.ok) {
      console.warn(`[ActivationCoach] Claude API ${res.status}`);
      return null;
    }
    const data = await res.json();
    const raw: string = (data.content?.[0]?.text ?? '').trim();
    if (!raw) return null;
    // Strip surrounding quotes the model occasionally adds
    return raw.replace(/^["']/, '').replace(/["']$/, '').trim();
  } catch (e) {
    console.warn('[ActivationCoach] generate failed:', e);
    return null;
  }
}

/**
 * Walk persisted ActionCards, fill firstStep for up to MAX_PER_RUN eligible
 * cards (pending, no firstStep, older than MIN_AGE_MS). Mutations are
 * persisted directly to @adhd:actionCards so the next render of the Now Feed
 * picks them up via the projection-merger.
 *
 * Designed to be called from inside the existing background-poll task — runs
 * after smart-scan so the freshest possible card list gets coached.
 */
export async function runActivationCoach(anthropicKey: string): Promise<number> {
  if (!anthropicKey) return 0;

  let cards: ActionCard[];
  try {
    const raw = await AsyncStorage.getItem(ACTION_CARDS_KEY);
    cards = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[ActivationCoach] read storage failed:', e);
    return 0;
  }
  if (cards.length === 0) return 0;

  const now = Date.now();
  const eligible = cards
    .filter(
      (c) =>
        c.status === 'pending' &&
        !c.firstStep &&
        now - new Date(c.createdAt).getTime() > MIN_AGE_MS
    )
    .slice(0, MAX_PER_RUN);

  if (eligible.length === 0) return 0;

  let filled = 0;
  for (const card of eligible) {
    const step = await generateFirstStep(card.title, card.context, anthropicKey);
    if (step) {
      card.firstStep = step;
      filled++;
    }
  }

  if (filled === 0) return 0;

  try {
    await AsyncStorage.setItem(ACTION_CARDS_KEY, JSON.stringify(cards));
  } catch (e) {
    console.warn('[ActivationCoach] write storage failed:', e);
  }
  return filled;
}
