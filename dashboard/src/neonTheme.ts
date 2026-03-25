/**
 * Neon color theme for the dashboard charts and UI.
 * Centralizes all color constants for a cohesive neon/glow aesthetic.
 */

export const NEON_SEVERITY_COLORS: Record<string, string> = {
  critical: "#ff1744",
  high: "#ff6d00",
  medium: "#ffea00",
  low: "#00e5ff",
  informational: "#d500f9",
};

export const NEON_SEVERITY_BG: Record<string, string> = {
  critical: "#ff174422",
  high: "#ff6d0022",
  medium: "#ffea0022",
  low: "#00e5ff22",
  informational: "#d500f922",
};

export const NEON_CONFIDENCE_COLORS: Record<string, string> = {
  high: "#00ff87",
  medium: "#ffea00",
  low: "#ff1744",
};

export const NEON = {
  // Primary accent (blue)
  accent: "#448aff",
  accentLight: "#82b1ff",
  accentGlow: "#448aff30",

  // Surfaces
  bg: "#0a0a0f",
  surface: "#0c1220",
  surfaceLight: "#111a2e",
  border: "#1a2744",
  borderGlow: "#448aff40",

  // Text
  textPrimary: "#e0eaff",
  textSecondary: "#7b8fb0",
  textMuted: "#4a5a78",

  // Chart specific
  gridLine: "#0d1b2a",
  tickX: "#80deea",
  tickY: "#4dd0e1",
  legendText: "#b0bec5",

  // Fidelity
  fidelityBest: "#00ff87",
  fidelityOther: "#448aff",

  // High fidelity
  highFidelityBest: "#ff6d00",
  highFidelityOther: "#ff6d0070",

  // Human match
  humanMatch: "#00ff87",
  humanMatchBg: "#00ff8718",
  humanMatchBorder: "#00ff8730",

  // Leaderboard podium
  gold: "#ffd740",
  silver: "#b0bec5",
  bronze: "#ffab40",

  // Category/tag bg
  tagBg: "#0d1b2a",

  // Model badge
  modelBadgeBg: "#448aff15",
  modelBadgeColor: "#82b1ff",
  modelBadgeBorder: "#448aff25",
};

/** Generate neon-gradient duration bar colors (cyan → white-blue) */
export function durationBarColor(index: number): string {
  return `hsl(${190 + index * 12}, 100%, ${60 + (index % 3) * 8}%)`;
}
