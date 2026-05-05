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
 * Run an async operation across a list with bounded concurrency and an
 * optional spacing delay between dispatches. Use this anywhere you'd
 * normally write `Promise.all(items.map(fn))` over a Claude / Whisper /
 * any-rate-limited endpoint — Anthropic enforces a concurrent-connection
 * cap and naive Promise.all fan-out trips it on inboxes of 10+.
 *
 * Errors are isolated per item: a failure on item N does NOT cancel the
 * rest. The returned array preserves input order; failed items get the
 * provided fallback (or `null` if none was given).
 *
 * @param items input items
 * @param fn async mapper
 * @param opts.concurrency how many in-flight at once (default 2)
 * @param opts.spacingMs delay BEFORE dispatching each new task (default 250)
 * @param opts.fallback value to use when fn rejects for an item
 * @param opts.label optional log prefix for diagnostics
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: {
    concurrency?: number;
    spacingMs?: number;
    fallback?: R;
    label?: string;
  } = {}
): Promise<(R | null)[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const spacingMs = Math.max(0, opts.spacingMs ?? 250);
  const fallback: R | null = opts.fallback ?? null;
  const label = opts.label ?? 'runWithConcurrency';

  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      if (spacingMs > 0 && i > 0) {
        await new Promise((r) => setTimeout(r, spacingMs));
      }
      try {
        results[i] = await fn(items[i], i);
      } catch (e: any) {
        console.warn(`[${label}] item ${i} failed:`, e?.message ?? e);
        results[i] = fallback;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
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
