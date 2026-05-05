/**
 * Amazon + Google Flights deep-link helpers — ADHD Command Center
 *
 * No API keys required. We open Amazon's search results page (and Google
 * Flights) so the user can complete the purchase / booking themselves.
 * Tries the native Amazon iOS app first, falls back to the browser.
 */

import { Linking } from 'react-native';

/**
 * Build an Amazon product search URL.
 */
export function buildAmazonSearchUrl(searchQuery: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(searchQuery)}`;
}

/**
 * Build the canonical Amazon product detail URL for a known ASIN.
 * The native Amazon iOS app intercepts this link if installed; otherwise it
 * opens in Safari. Used by Memory-Augmented Action when the contextMiner
 * extracts an ASIN from a past order email.
 */
export function buildAmazonProductUrl(asin: string): string {
  return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
}

/**
 * Open Amazon directly to a product page by ASIN. Falls back to a search if
 * the deep link can't be opened for any reason.
 */
export async function openAmazonProduct(asin: string, fallbackQuery?: string): Promise<void> {
  const productUrl = buildAmazonProductUrl(asin);
  try {
    await Linking.openURL(productUrl);
  } catch {
    if (fallbackQuery) {
      await openAmazonSearch(fallbackQuery);
    } else {
      await Linking.openURL(`https://www.amazon.com/dp/${asin}`);
    }
  }
}

/**
 * Open Amazon to search for a product.
 * Tries the Amazon app first (if installed), falls back to browser.
 */
export async function openAmazonSearch(searchQuery: string): Promise<void> {
  const webUrl = buildAmazonSearchUrl(searchQuery);
  const appUrl = `amazon://search?keywords=${encodeURIComponent(searchQuery)}`;
  try {
    const canOpenApp = await Linking.canOpenURL(appUrl);
    await Linking.openURL(canOpenApp ? appUrl : webUrl);
  } catch {
    // Final fallback if canOpenURL throws (e.g. Info.plist LSApplicationQueriesSchemes missing)
    await Linking.openURL(webUrl);
  }
}

/**
 * Build a Google Flights search URL for a destination + optional departure date.
 */
export function buildFlightsUrl(
  destination: string,
  departureDateISO: string | null
): string {
  const date = departureDateISO ? departureDateISO.slice(0, 10) : '';
  const query = `flights to ${destination}${date ? ` on ${date}` : ''}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

/**
 * Open Google Flights for a destination.
 */
export async function openFlightSearch(
  destination: string,
  departureDateISO: string | null
): Promise<void> {
  await Linking.openURL(buildFlightsUrl(destination, departureDateISO));
}
