// Random, balanced group assignment shared by both pages.
// Each joiner takes the next slot from a counter. Slots are dealt out in rounds: every round
// gives each group exactly one slot, in an order shuffled from the board's seed. So group sizes
// never differ by more than one, yet which group a person lands in is random.

import { COLORS } from "./posts.js";

export const MAX_GROUPS = 12;

/** Small seeded PRNG (mulberry32) so every phone derives the same shuffle from the seed. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Group number (1-based) for a 0-based join slot. */
export function groupForSlot(slot, groupCount, seed) {
  const round = Math.floor(slot / groupCount);
  const order = Array.from({ length: groupCount }, (_, i) => i + 1);
  const random = prng(seed + Math.imul(round + 1, 0x9e3779b9));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order[slot % groupCount];
}

/**
 * Position of a person within their group, counting from 1. Every round gives each group exactly
 * one slot, so the round number tells the members of a group apart.
 */
export const memberNumber = (slot, groupCount) => Math.floor(slot / groupCount) + 1;

export const groupCountOf = (meta) => (meta?.groups > 1 ? meta.groups : 0);

export const groupLabel = (group) => `Group ${group}`;

/** A distinct hue per group, spread by the golden angle so neighbours never look alike. */
export const groupHue = (group) => Math.round(((group - 1) * 137.508 + 200) % 360);

/**
 * Note colour for a group: the palette shuffled from the board's seed, so each group gets its own
 * random colour. With more groups than colours the palette repeats.
 */
export function groupColor(group, seed) {
  const palette = [...COLORS];
  const random = prng((seed || 0) ^ 0x5bd1e995);
  for (let i = palette.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [palette[i], palette[j]] = [palette[j], palette[i]];
  }
  return palette[(group - 1) % palette.length];
}

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
}
