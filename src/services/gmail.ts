/**
 * Gmail API service — ADHD Command Center
 *
 * Functions:
 *   createDraft()        — save a draft to Gmail (never auto-sends)
 *   fetchUnreadEmails()  — get unread inbox messages for triage
 *   sendDraft()          — send an existing draft (user-initiated only)
 *   archiveMessage()     — archive (remove from inbox)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getValidAccessToken } from './auth';
import { buildMimeMessage, toBase64Url } from './utils';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const EMAIL_CACHE_KEY = '@adhd:emailCache';

// ─── Helper ───────────────────────────────────────────────────────────────────

async function gmailFetch(path: string, options: RequestInit = {}) {
  const token = await getValidAccessToken();
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Gmail API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Create draft ─────────────────────────────────────────────────────────────

export async function createDraft({
  to,
  subject,
  body,
  fromEmail,
}: {
  to?: string;
  subject: string;
  body: string;
  fromEmail: string;
}): Promise<{ draftId: string; messageId: string }> {
  const mime = buildMimeMessage({ to, subject, body, from: fromEmail });
  const encoded = toBase64Url(mime);

  const data = await gmailFetch('/drafts', {
    method: 'POST',
    body: JSON.stringify({ message: { raw: encoded } }),
  });

  return { draftId: data.id, messageId: data.message.id };
}

// ─── Fetch unread emails ──────────────────────────────────────────────────────

export interface RawEmail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  snippet: string;
  receivedAt: string;
}

export async function fetchUnreadEmails(maxResults = 20): Promise<RawEmail[]> {
  // List unread messages in inbox
  const listData = await gmailFetch(
    `/messages?labelIds=INBOX&q=is:unread&maxResults=${maxResults}`
  );

  if (!listData.messages?.length) return [];

  // Fetch each message in parallel
  const messages = await Promise.all(
    listData.messages.map((m: { id: string }) =>
      gmailFetch(`/messages/${m.id}?format=full`)
    )
  );

  return messages.map((msg: any): RawEmail => {
    const headers: Record<string, string> = {};
    (msg.payload?.headers ?? []).forEach((h: { name: string; value: string }) => {
      headers[h.name.toLowerCase()] = h.value;
    });

    const body = extractBody(msg.payload);

    return {
      id: msg.id,
      threadId: msg.threadId,
      from: headers['from'] ?? 'Unknown',
      subject: headers['subject'] ?? '(no subject)',
      body,
      snippet: msg.snippet ?? '',
      receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    };
  });
}

function extractBody(payload: any): string {
  if (!payload) return '';

  // Single-part message
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  // Multi-part — prefer text/plain
  if (payload.parts) {
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain');
    if (plain?.body?.data) {
      return atob(plain.body.data.replace(/-/g, '+').replace(/_/g, '/'));
    }
    // Fall back to first part
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  return '';
}

// ─── Send a draft ─────────────────────────────────────────────────────────────

export async function sendDraft(draftId: string): Promise<void> {
  await gmailFetch('/drafts/send', {
    method: 'POST',
    body: JSON.stringify({ id: draftId }),
  });
}

// ─── Archive a message ────────────────────────────────────────────────────────

export async function archiveMessage(messageId: string): Promise<void> {
  await gmailFetch(`/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  });
}

// ─── Mark as read ─────────────────────────────────────────────────────────────

export async function markAsRead(messageId: string): Promise<void> {
  await gmailFetch(`/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

// ─── Generic search (used by receipt indexer + contextMiner) ───────────────

/**
 * Run an arbitrary Gmail search and return matching emails with body. Used
 * by the receipt indexer (order-confirmation queries) and by the
 * contextMiner's deeper-search fallback. Does not affect read/unread state.
 *
 * Pass standard Gmail operators in `query` (e.g. `from:amazon.com newer_than:90d`).
 */
export async function searchInboxEmails(query: string, maxResults = 20): Promise<RawEmail[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const listData = await gmailFetch(`/messages?${params.toString()}`);
  if (!listData.messages?.length) return [];

  const messages = await Promise.all(
    listData.messages.map((m: { id: string }) =>
      gmailFetch(`/messages/${m.id}?format=full`)
    )
  );

  return messages.map((msg: any): RawEmail => {
    const headers: Record<string, string> = {};
    (msg.payload?.headers ?? []).forEach((h: { name: string; value: string }) => {
      headers[h.name.toLowerCase()] = h.value;
    });
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: headers['from'] ?? 'Unknown',
      subject: headers['subject'] ?? '(no subject)',
      body: extractBody(msg.payload),
      snippet: msg.snippet ?? '',
      receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    };
  });
}

// ─── Recent inbox cache (used by contextMiner) ───────────────────────────────
//
// The Memory-Augmented Action flow needs sub-3-second access to the user's
// recent email metadata (id + sender + subject + snippet). Persists under
// `@adhd:emailCache` so the cache survives a cold launch.

export interface CachedEmailMeta {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

interface CacheEnvelope {
  cachedAt: string;
  emails: CachedEmailMeta[];
}

async function readCache(): Promise<CacheEnvelope | null> {
  try {
    const raw = await AsyncStorage.getItem(EMAIL_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeCache(emails: CachedEmailMeta[]): Promise<void> {
  const envelope: CacheEnvelope = {
    cachedAt: new Date().toISOString(),
    emails,
  };
  await AsyncStorage.setItem(EMAIL_CACHE_KEY, JSON.stringify(envelope));
}

/**
 * Fetch the last ~50 inbox messages as lightweight metadata. If the cache is
 * fresh (< maxAgeMin), returns it directly. Otherwise calls Gmail with
 * `format=metadata` to skip body downloads, then persists.
 *
 * Returns [] on auth or network error rather than throwing — the contextMiner
 * has a non-matched fallback path.
 */
export async function getRecentInboxCached(
  maxAgeMin = 30,
  maxResults = 50
): Promise<CachedEmailMeta[]> {
  const cache = await readCache();
  if (cache) {
    const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
    if (ageMs < maxAgeMin * 60 * 1000) {
      return cache.emails;
    }
  }

  try {
    const listData = await gmailFetch(
      `/messages?labelIds=INBOX&maxResults=${maxResults}`
    );
    if (!listData.messages?.length) {
      await writeCache([]);
      return [];
    }

    const messages = await Promise.all(
      listData.messages.map((m: { id: string }) =>
        // metadata format avoids downloading body bytes
        gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    );

    const emails: CachedEmailMeta[] = messages.map((msg: any) => {
      const headers: Record<string, string> = {};
      (msg.payload?.headers ?? []).forEach((h: { name: string; value: string }) => {
        headers[h.name.toLowerCase()] = h.value;
      });
      return {
        id: msg.id,
        from: headers['from'] ?? 'Unknown',
        subject: headers['subject'] ?? '(no subject)',
        snippet: msg.snippet ?? '',
        receivedAt: new Date(Number(msg.internalDate)).toISOString(),
      };
    });

    await writeCache(emails);
    return emails;
  } catch (e: any) {
    console.warn('[Gmail] getRecentInboxCached failed:', e?.message ?? e);
    // Fall back to whatever's in cache, even if stale, so contextMiner still
    // has something to work with on a flaky connection.
    return cache?.emails ?? [];
  }
}

/**
 * Force a cache refresh (ignores TTL). Used when the user explicitly pulls
 * the inbox.
 */
export async function refreshRecentInboxCache(maxResults = 50): Promise<CachedEmailMeta[]> {
  await AsyncStorage.removeItem(EMAIL_CACHE_KEY);
  return getRecentInboxCached(0, maxResults);
}
