/**
 * Design tokens — ADHD-friendly: high contrast, minimal clutter, clear hierarchy
 */

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
  body: { fontSize: 15, fontWeight: '400' as const, color: '#ffffff' },
  bodyMuted: { fontSize: 15, fontWeight: '400' as const, color: '#a0a0b8' },
  caption: { fontSize: 13, fontWeight: '400' as const, color: '#a0a0b8' },
  label: { fontSize: 12, fontWeight: '600' as const, color: '#a0a0b8', letterSpacing: 0.8 },
};
