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
