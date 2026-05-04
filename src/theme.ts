/**
 * Design tokens — ADHD-friendly: high contrast, minimal clutter, clear hierarchy
 *
 * Typography rules (non-negotiable):
 *   - Minimum 16px for any body text
 *   - High contrast — WCAG AA minimum (4.5:1)
 *   - Prefer Atkinson Hyperlegible for dyslexia-friendliness
 *
 * Symptom colors: muted, accessible — never neon. Each maps to an ADHD symptom category.
 */

// Symptom category IDs — use these as keys throughout the app
export type SymptomId =
  | 'inattention'
  | 'hyperactivity'
  | 'impulsivity'
  | 'emotional'
  | 'working_memory'
  | 'time_blindness'
  | 'executive'
  | 'hyperfocus'
  | 'sleep';

// Muted, accessible palette — one color per symptom category
export const symptomColors: Record<SymptomId, string> = {
  inattention:    '#5B8DB8', // Soft blue — calm, focus
  hyperactivity:  '#E8924A', // Warm orange — energy, motion
  impulsivity:    '#C4758A', // Dusty rose — pause, warmth
  emotional:      '#9B7EC8', // Muted violet — empathy
  working_memory: '#5BAA8D', // Sage green — capture, growth
  time_blindness: '#D4A843', // Amber — urgency, awareness
  executive:      '#6B9E6B', // Muted green — forward motion
  hyperfocus:     '#B07850', // Warm brown — grounding
  sleep:          '#6B89B0', // Deep slate blue — rest, night
};

export const colors = {
  // Background layers
  bg: '#0f0f1a',
  bgCard: '#1a1a2e',
  bgCardAlt: '#16213e',
  bgInput: '#242438',

  // Brand
  purple: '#6c63ff',
  purpleDim: '#4a4580',

  // Priority / status
  urgent: '#ff4757',
  actionNeeded: '#ffa502',
  fyi: '#2ed573',
  noise: '#747d8c',

  // Semantic
  success: '#2ed573',
  warning: '#ffa502',
  error: '#ff4757',
  info: '#1e90ff',

  // Text
  textPrimary: '#ffffff',
  textSecondary: '#a0a0b8',
  textMuted: '#5c5c7a',

  // Borders
  border: '#2a2a40',
  borderFocus: '#6c63ff',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: '#ffffff' },
  h2: { fontSize: 22, fontWeight: '700' as const, color: '#ffffff' },
  h3: { fontSize: 18, fontWeight: '600' as const, color: '#ffffff' },
  body: { fontSize: 16, fontWeight: '400' as const, color: '#ffffff', lineHeight: 24 },       // 16px minimum — ADHD design rule
  bodyMuted: { fontSize: 16, fontWeight: '400' as const, color: '#a0a0b8', lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: '400' as const, color: '#a0a0b8', lineHeight: 19 },    // caption only — not body content
  label: { fontSize: 12, fontWeight: '600' as const, color: '#a0a0b8', letterSpacing: 0.8 },  // labels/tags only, not body
};
