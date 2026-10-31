// Note validation, filtering, colours and sorting shared by both pages.

export const MAX_WORDS = 256;
// The database rules can't count words, so they cap the length in characters instead.
// Roomy enough that 256 words of ordinary prose never reaches it.
export const MAX_CHARS = 3000;
export const NAME_MAX = 30;
export const COLORS = ["yellow", "pink", "blue", "green", "purple", "orange"];

// Kept deliberately short; approval mode and presenter moderation catch what this misses.
// Stems match at the start of a word (avoids flagging e.g. "Scunthorpe"); "fuck" matches anywhere.
const BLOCKED_STEMS = /^(shit|cunt|nigg|fagg|motherf)|fuck/;
const BLOCKED_WORDS = new Set(`
ass arse asshole arsehole bullshit bitch bastard bollocks cock dick dickhead piss prick pussy
slut whore wanker twat retard fag tits boobs
`.trim().split(/\s+/));

/** Trim, normalise line endings and collapse runs of blank lines. */
export function normalize(raw) {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isBlocked(text) {
  return text
    .toLocaleLowerCase()
    .split(/[\s\-'.,!?;:()"]+/)
    .map((t) => t.replace(/[^\p{L}]/gu, ""))
    .some((t) => BLOCKED_WORDS.has(t) || BLOCKED_STEMS.test(t));
}

/** Words are runs of non-space characters, so "well-known" counts as one. */
export function countWords(text) {
  return (String(text ?? "").match(/\S+/g) || []).length;
}

/** Validate a participant's note. Returns { ok, text } or { ok: false, error }. */
export function validate(raw) {
  const text = normalize(raw);
  if (!text) return { ok: false, error: "Write something first." };
  if (countWords(text) > MAX_WORDS) return { ok: false, error: `Keep it to ${MAX_WORDS} words or fewer.` };
  if (text.length > MAX_CHARS) return { ok: false, error: `Keep it to ${MAX_CHARS} characters or fewer.` };
  if (isBlocked(text)) return { ok: false, error: "Let's keep it friendly. Try rewording your note." };
  return { ok: true, text };
}

/** Clean an optional display name. Returns "" for anonymous. */
export function cleanName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return isBlocked(name) ? "" : name;
}

export const isColor = (c) => COLORS.includes(c);

/**
 * Turn a { id: post } map into a sorted array. Highlighted notes always come first.
 * @param {"newest"|"oldest"|"likes"} sort
 * @param {Record<string, Record<string, true>>} likes
 */
export function toSortedList(posts, likes = {}, sort = "newest") {
  const list = Object.entries(posts || {}).map(([id, p]) => ({
    id, ...p, likeCount: Object.keys(likes[id] || {}).length,
  }));
  const byTime = (a, b) => (sort === "oldest" ? a.ts - b.ts : b.ts - a.ts);
  return list.sort((a, b) =>
    (b.highlighted === true) - (a.highlighted === true) ||
    (sort === "likes" ? b.likeCount - a.likeCount : 0) ||
    byTime(a, b));
}
