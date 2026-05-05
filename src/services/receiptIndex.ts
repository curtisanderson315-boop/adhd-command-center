/**
 * Receipt / Order Memory Index
 *
 * Background job that scans Gmail for order confirmation emails and persists
 * them as a fast local index under @adhd:purchases. The Memory-Augmented
 * Action engine (contextMiner) consults this first — sub-50ms lookup beats
 * a 2-3 second live Gmail search every time.
 *
 * Re-scans weekly. Driven from the existing background poll (background.ts);
 * does NOT define a new TaskManager task.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchInboxEmails } from './gmail';
import type { PurchaseRecord } from '../types';

const PURCHASES_KEY = '@adhd:purchases';
const LAST_INDEX_AT_KEY = '@adhd:purchases:lastIndexAt';
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

// Senders the spec calls out, plus a few obvious additions. The query also
// matches ANY message whose subject starts with "Your order" or
// "Order confirmation" — that's the tolerant fallback per spec.
const SEARCH_QUERY = [
  '(',
  'from:auto-confirm@amazon.com',
  'OR from:order-update@amazon.com',
  'OR from:shipment-tracking@amazon.com',
  'OR from:noreply@chewy.com',
  'OR from:orders@chewy.com',
  'OR from:orders.target.com',
  'OR from:noreply@walmart.com',
  'OR from:orders@instacart.com',
  'OR subject:"Your order"',
  'OR subject:"Order confirmation"',
  'OR subject:"Your Amazon order"',
  ')',
  'newer_than:180d',
].join(' ');

// ─── Public: read ──────────────────────────────────────────────────────────

export async function getPurchaseIndex(): Promise<PurchaseRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PURCHASES_KEY);
    return raw ? (JSON.parse(raw) as PurchaseRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Find a likely match in the index for a free-text query. Used by the
 * contextMiner as its first lookup (fast, local). Tokenized substring match
 * across vendor + productName + rawSubject. Case-insensitive.
 */
export async function findInPurchaseIndex(
  query: string,
  limit = 5
): Promise<PurchaseRecord[]> {
  const records = await getPurchaseIndex();
  if (records.length === 0) return [];
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return [];

  const scored = records.map((r) => {
    const haystack = `${r.vendor} ${r.productName} ${r.rawSubject}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score++;
    }
    return { r, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.r);
}

// ─── Public: indexer entry point (called from background poll) ────────────

export async function runReceiptIndexer(): Promise<number> {
  // Throttle: weekly rescan
  try {
    const lastRaw = await AsyncStorage.getItem(LAST_INDEX_AT_KEY);
    if (lastRaw) {
      const lastMs = Number(lastRaw);
      if (!isNaN(lastMs) && Date.now() - lastMs < REFRESH_INTERVAL_MS) {
        return 0;
      }
    }
  } catch {
    // fall through to a fresh index
  }

  let emails;
  try {
    emails = await searchInboxEmails(SEARCH_QUERY, 50);
  } catch (e: any) {
    console.warn('[ReceiptIndex] search failed:', e?.message ?? e);
    return 0;
  }

  if (emails.length === 0) {
    await AsyncStorage.setItem(LAST_INDEX_AT_KEY, String(Date.now()));
    return 0;
  }

  const records: PurchaseRecord[] = [];
  for (const e of emails) {
    const parsed = parseOrderEmail(e);
    if (parsed) records.push(parsed);
  }

  // Dedupe by emailId (idempotent re-indexes)
  const byId = new Map<string, PurchaseRecord>();
  for (const r of records) byId.set(r.emailId, r);
  const deduped = Array.from(byId.values());

  await AsyncStorage.setItem(PURCHASES_KEY, JSON.stringify(deduped));
  await AsyncStorage.setItem(LAST_INDEX_AT_KEY, String(Date.now()));
  return deduped.length;
}

// ─── Parser ────────────────────────────────────────────────────────────────

const ASIN_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})\b/i,
  /\/gp\/product\/([A-Z0-9]{10})\b/i,
  /\bASIN[:\s]+([A-Z0-9]{10})\b/i,
];

const PRICE_PATTERN = /\$([0-9]+(?:\.[0-9]{2})?)/;

interface SourceEmail {
  id: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

function parseOrderEmail(e: SourceEmail): PurchaseRecord | null {
  const vendor = vendorFromAddress(e.from);

  // Product name extraction: best-effort. Walk a small set of patterns.
  const productName = extractProductName(e.subject, e.body) ?? cleanSubject(e.subject);

  // ASIN detection — strongly Amazon-specific but cheap to try on every email.
  let asin: string | undefined;
  for (const p of ASIN_PATTERNS) {
    const m = e.body.match(p) ?? e.subject.match(p);
    if (m) {
      asin = m[1].toUpperCase();
      break;
    }
  }

  // Price detection
  const priceMatch = (e.body.match(PRICE_PATTERN) ?? e.subject.match(PRICE_PATTERN));
  const price = priceMatch ? `$${priceMatch[1]}` : undefined;

  if (!productName) return null;

  return {
    vendor,
    productName,
    asin,
    price,
    orderedAt: e.receivedAt,
    emailId: e.id,
    rawSubject: e.subject,
  };
}

function vendorFromAddress(from: string): string {
  const lower = from.toLowerCase();
  if (lower.includes('amazon')) return 'Amazon';
  if (lower.includes('chewy')) return 'Chewy';
  if (lower.includes('walmart')) return 'Walmart';
  if (lower.includes('target')) return 'Target';
  if (lower.includes('instacart')) return 'Instacart';
  // Pull domain
  const m = from.match(/@([^>\s]+)/);
  if (m) return m[1].split('.')[0];
  return 'Unknown';
}

function cleanSubject(subject: string): string {
  // "Your Amazon.com order of Item Name." → "Item Name"
  // "Order confirmation: 3 items" → "Order confirmation: 3 items"
  return subject
    .replace(/^(Your Amazon\.com order of |Your order of |Your order: |Order confirmation: ?)/i, '')
    .replace(/\.$/, '')
    .trim();
}

function extractProductName(subject: string, body: string): string | null {
  // Common Amazon shape: "Your Amazon.com order of <Product>."
  const m1 = subject.match(/order of (.+?)(?:\.|$)/i);
  if (m1) return m1[1].trim();

  // Line in body shaped like "Item: Product Name"
  const m2 = body.match(/(?:Item|Product)(?:\(s\))?:\s*([^\r\n]{3,120})/i);
  if (m2) return m2[1].trim();

  return null;
}
