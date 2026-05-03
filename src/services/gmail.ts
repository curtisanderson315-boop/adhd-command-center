/**
 * Gmail API service — ADHD Command Center
 *
 * Functions:
 *   createDraft()        — save a draft to Gmail (never auto-sends)
 *   fetchUnreadEmails()  — get unread inbox messages for triage
 *   sendDraft()          — send an existing draft (user-initiated only)
 *   archiveMessage()     — archive (remove from inbox)
 */

import { getValidAccessToken } from './auth';
import { buildMimeMessage, toBase64Url } from './utils';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

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
