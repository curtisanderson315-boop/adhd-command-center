/**
 * Lightweight nanoid-style ID generator (no extra dependency needed)
 */
export function nanoid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Encodes a string to base64url (used for Gmail MIME messages)
 */
export function toBase64Url(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build a minimal RFC 2822 MIME email string
 */
export function buildMimeMessage({
  to,
  subject,
  body,
  from,
}: {
  to?: string;
  subject: string;
  body: string;
  from: string;
}): string {
  const lines = [
    `From: ${from}`,
    to ? `To: ${to}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ]
    .filter((l) => l !== null)
    .join('\r\n');
  return lines;
}

/**
 * Format a relative time string for display (e.g. "2 hours ago")
 */
export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString();
}
