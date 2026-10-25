// Group chat: message validation and the conversation view, shared by both pages.
// Every message carries its sender's group, and the database rules let a person read only the
// messages of their own group. Members are told apart by "Member N" (their position in the
// group) or by an optional chat name. Other members' messages sit on the left with a coloured
// avatar and their name; the viewer's own messages sit on the right.

import { normalize, isBlocked } from "./posts.js";
import { groupHue, memberNumber } from "./groups.js";
import { el } from "./board.js";

export const CHAT_MAX_LEN = 300;

/** Validate a chat message. Returns { ok, text } or { ok: false, error }. */
export function validateMessage(raw) {
  const text = normalize(raw);
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > CHAT_MAX_LEN) return { ok: false, error: `Keep it to ${CHAT_MAX_LEN} characters or fewer.` };
  if (isBlocked(text)) return { ok: false, error: "Let's keep it friendly. Try rewording your message." };
  return { ok: true, text };
}

/** Turn a { id: message } map into a list, oldest first. */
export function chatList(messages) {
  return Object.entries(messages || {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
}

/** The chat name someone chose, or "Member 3" (their position in the group). */
export const senderName = (message, groupCount) =>
  message.name || `Member ${memberNumber(message.slot, groupCount)}`;

/** How a member appears to the rest of their group: "Aisha #3" with a chosen name, else "Member 3". */
export const memberLabel = (name, number) => (name ? `${name} #${number}` : `Member ${number}`);

// A thumbs up is { slot, name? } saying who gave it. Older ones were just `true`.
const isLike = (v) => v === true || (!!v && typeof v === "object");

/** A message's thumbs up, added up: each member who gave one counts once. */
export const likeCount = (message) => Object.values(message.likes || {}).filter(isLike).length;

/** Who gave a message a thumbs up, as labels: you first, then the others by member number. */
function likers(message, { groupCount, myUid }, people) {
  return Object.entries(message.likes || {})
    .filter(([, v]) => isLike(v))
    .map(([uid, v]) => {
      if (uid === myUid) return { rank: -1, label: "You" };
      const from = Number.isFinite(v?.slot) ? v : people.get(uid); // older ones are matched to the person's messages
      if (!from) return { rank: Infinity, label: "Someone" };
      const number = memberNumber(from.slot, groupCount);
      return { rank: number, label: memberLabel(from.name, number) };
    })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .map((l) => l.label);
}

function actionButton(label, title, onClick) {
  const btn = el("button", "chat-action", label);
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.addEventListener("click", onClick);
  return btn;
}

/** The round badge beside someone else's message: the first letter of their name, else their number. */
function avatar(message, number) {
  const badge = el("span", "chat-avatar", message.name ? [...message.name][0].toUpperCase() : String(number));
  badge.setAttribute("aria-hidden", "true");
  return badge;
}

/**
 * The thumbs-up row under a message: the count, then who gave them. The count is a toggle on other
 * people's messages when `onLike` is given, otherwise plain text. Null when there's nothing to show.
 */
function reaction(message, opts, people) {
  const { myUid, onLike } = opts;
  const count = likeCount(message);
  let chip;
  if (onLike && message.uid !== myUid) {
    const liked = isLike(message.likes?.[myUid]);
    chip = el("button", "chat-react", count ? `👍 ${count}` : "👍");
    chip.type = "button";
    chip.title = liked ? "Take back your thumbs up" : "Thumbs up";
    chip.setAttribute("aria-label", `${chip.title}, ${count} so far`);
    chip.setAttribute("aria-pressed", String(liked));
    chip.addEventListener("click", () => onLike(message, !liked));
  } else if (count) {
    chip = el("span", "chat-react", `👍 ${count}`);
  } else {
    return null;
  }

  const foot = el("footer", "chat-foot");
  foot.append(chip);
  const names = likers(message, opts, people);
  if (names.length) {
    const who = el("span", "chat-likers", names.join(", "));
    who.title = `Thumbs up from ${names.join(", ")}`;
    foot.append(who);
  }
  return foot;
}

function bubble(message, opts, people) {
  const { groupCount, myUid, actions } = opts;
  const mine = message.uid === myUid;
  const number = memberNumber(message.slot, groupCount);

  const node = el("article", `chat-msg ${mine ? "mine" : "theirs"}`);
  node.style.setProperty("--member-hue", groupHue(number));

  // Every message names its sender, so it is always clear who is talking
  const head = el("header", "chat-head");
  head.append(el("span", "chat-who", mine ? "You" : senderName(message, groupCount)));
  if (message.name && !mine) head.append(el("span", "chat-num", `#${number}`));
  head.append(el("span", "chat-time", new Date(message.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })));
  for (const [label, title, fn] of actions?.(message) || []) head.append(actionButton(label, title, fn));

  const body = el("div", "chat-bubble");
  body.append(head, el("p", "chat-text", message.text));
  const foot = reaction(message, opts, people);
  if (foot) body.append(foot);

  if (!mine) node.append(avatar(message, number));
  node.append(body);
  return node;
}

/**
 * Show a conversation. The newest message stays in view if the reader was already at the bottom.
 * @param {HTMLElement} container
 * @param {object[]} messages  oldest first, each { id, uid, slot, name, text, ts, likes }
 * @param {object} opts
 *   groupCount  number of groups on the board (turns a join slot into "Member N")
 *   myUid       marks the viewer's own messages
 *   onLike      (message, liked) → void; lets the viewer thumbs-up other people's messages.
 *               Without it, counts are shown but can't be changed
 *   actions     message → [[label, title, onClick], ...] extra buttons per message
 *   emptyText   message for an empty chat
 */
export function renderChat(container, messages, opts = {}) {
  const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
  const people = new Map(messages.map((m) => [m.uid, { slot: m.slot, name: m.name }]));
  const items = messages.map((m) => bubble(m, opts, people));
  container.replaceChildren(...(items.length ? items : [el("p", "chat-empty", opts.emptyText || "No messages yet")]));
  if (atBottom) container.scrollTop = container.scrollHeight;
}
