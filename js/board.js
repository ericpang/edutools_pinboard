// Shared rendering of notes as cards, in Wall or Columns layout.
// Card elements are reused between renders, so only new notes play the pop-in animation.

import { groupLabel, groupHue } from "./groups.js";

/** Columns from meta, sorted by their `order`. */
export function columnsOf(meta) {
  if (meta?.layout !== "columns") return [];
  return Object.entries(meta.columns || {})
    .map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => a.order - b.order);
}

const cardCache = new WeakMap(); // container → Map(id → element)

function cacheFor(container) {
  let cache = cardCache.get(container);
  if (!cache) cardCache.set(container, (cache = new Map()));
  return cache;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function actionButton(label, title, onClick) {
  const btn = el("button", "note-action", label);
  btn.type = "button";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return btn;
}

/** A small coloured "Group N" tag. */
export function groupChip(group, className = "group-chip") {
  const chip = el("span", className, groupLabel(group));
  chip.style.setProperty("--group-hue", groupHue(group));
  return chip;
}

/**
 * Build or update one card.
 * @param {object} note  { id, text, color, name, group, likeCount, highlighted, uid, editedAt, status }
 * @param {object} opts  see renderBoard
 */
function card(cache, note, opts) {
  let node = cache.get(note.id);
  if (!node) {
    node = el("article", "note pop");
    node.dataset.id = note.id;
    node.addEventListener("animationend", () => node.classList.remove("pop"), { once: true });
    cache.set(note.id, node);
  }
  const mine = opts.myUid && note.uid === opts.myUid;
  node.className = `note note-${note.color || "yellow"}${node.classList.contains("pop") ? " pop" : ""}`;
  node.classList.toggle("highlighted", note.highlighted === true);
  node.classList.toggle("mine", !!mine);
  node.classList.toggle("concealed", !!opts.concealed);
  node.classList.toggle("clickable", !!opts.onOpen && !opts.concealed);
  node.onclick = opts.onOpen && !opts.concealed ? () => opts.onOpen(note) : null;
  applySize(node, opts.sizes?.[note.id], !opts.columns?.length);
  const handle = opts.onResize ? resizeHandle(node, note, opts) : null;

  if (opts.concealed) {
    node.replaceChildren(el("span", "note-back", "?"), ...(handle ? [handle] : []));
    node.setAttribute("aria-label", "Hidden note");
    return node;
  }
  node.removeAttribute("aria-label");

  const children = [];
  if (note.highlighted) children.push(el("span", "note-star", "★"));
  children.push(el("p", "note-text", note.text));

  const foot = el("footer", "note-foot");
  const who = el("span", "note-name");
  if (mine) who.append(el("span", "you-badge", "You"));
  if (opts.showGroups && note.group) who.append(groupChip(note.group));
  if (opts.showNames && note.name) who.append(document.createTextNode(note.name));
  if (note.editedAt) who.append(el("span", "edited", "edited"));
  foot.append(who);

  const actions = el("span", "note-actions");
  for (const [label, title, fn] of opts.actions?.(note) || []) actions.append(actionButton(label, title, fn));
  if (note.status) actions.prepend(el("span", "note-status", note.status));

  if (opts.showLikes !== false && note.status == null) {
    const liked = !!opts.likedByMe?.(note);
    const like = el("button", `like${liked ? " liked" : ""}`, `${liked ? "♥" : "♡"} ${note.likeCount || 0}`);
    like.type = "button";
    like.setAttribute("aria-pressed", String(liked));
    like.setAttribute("aria-label", `${liked ? "Unlike" : "Like"} this note, ${note.likeCount || 0} likes`);
    if (opts.onLike) like.addEventListener("click", (e) => { e.stopPropagation(); opts.onLike(note, !liked); });
    else like.disabled = true;
    actions.append(like);
  }
  foot.append(actions);
  children.push(foot);
  if (handle) children.push(handle);
  node.replaceChildren(...children);
  return node;
}

/* ---------- Resizing ---------- */

const MIN_NOTE_HEIGHT = 60;

/** size: { span, h } — span = grid columns covered (Wall only), h = minimum height in px. */
function applySize(node, size, wall) {
  const span = wall && size?.span > 1 ? size.span : 0;
  if (span) node.dataset.span = span;
  else delete node.dataset.span;
  node.style.gridColumn = span ? `span ${span}` : ""; // clamped to the real column count by wallTracks
  node.style.minHeight = size?.h ? `${size.h}px` : "";
}

/** Number of columns the Wall grid can fit, ignoring any extra columns that wide notes would add. */
function wallTracks(grid) {
  const wide = [...grid.querySelectorAll(":scope > .note[data-span]")];
  wide.forEach((n) => { n.style.gridColumn = ""; });
  const count = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  wide.forEach((n) => { n.style.gridColumn = `span ${Math.min(Number(n.dataset.span), count)}`; });
  return count;
}

/** Keep wide notes within the available columns when the board changes size. */
const resizeObservers = new WeakMap();
function watchWallWidth(container) {
  if (resizeObservers.has(container) || typeof ResizeObserver === "undefined") return;
  let lastWidth = 0;
  const observer = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width);
    if (width === lastWidth) return;
    lastWidth = width;
    if (container.classList.contains("wall")) wallTracks(container);
  });
  observer.observe(container);
  resizeObservers.set(container, observer);
}

function resizeHandle(node, note, opts) {
  const handle = el("span", "note-resize");
  handle.title = "Drag to resize. Double-click to reset.";
  handle.setAttribute("aria-hidden", "true");
  handle.addEventListener("click", (e) => e.stopPropagation()); // don't open the note
  handle.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    applySize(node, null, false);
    opts.onResize(note, null, true);
  });
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);

    const grid = node.parentElement;
    const wall = grid.classList.contains("wall");
    const style = getComputedStyle(grid);
    const tracks = style.gridTemplateColumns.split(" ").map(parseFloat);
    const gap = parseFloat(style.columnGap) || 0;
    const start = node.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let size = opts.sizes?.[note.id] || null;
    node.classList.add("resizing");

    const move = (ev) => {
      const width = start.width + ev.clientX - startX;
      const span = wall ? Math.min(tracks.length, Math.max(1, Math.round((width + gap) / (tracks[0] + gap)))) : 1;
      const h = Math.max(MIN_NOTE_HEIGHT, Math.round(start.height + ev.clientY - startY));
      size = { span, h };
      applySize(node, size, wall);
      opts.onResize(note, size, false);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      node.classList.remove("resizing");
      opts.onResize(note, size, true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
  return handle;
}

/**
 * Render notes into `container`.
 * @param {HTMLElement} container
 * @param {object[]} notes  already sorted
 * @param {object} opts
 *   columns     [{id, name}] for Columns layout, [] for Wall
 *   showNames   show author names
 *   showGroups  tag each note with its author's group
 *   myUid       marks the viewer's own notes
 *   concealed   show card backs only (reveal mode on the projector)
 *   actions     note → [[label, title, onClick], ...] extra buttons per note
 *   onLike      (note, liked) → void; omit for read-only like counts
 *   likedByMe   note → boolean
 *   onOpen      note → void; click a card to enlarge it
 *   emptyText   message for an empty wall or column
 *   sizes       { [noteId]: { span, h } } per-note sizes
 *   onResize    (note, size|null, done) → void; adds a resize handle to each card
 */
export function renderBoard(container, notes, opts = {}) {
  const cache = cacheFor(container);
  const seen = new Set(notes.map((n) => n.id));
  for (const id of cache.keys()) if (!seen.has(id)) cache.delete(id);

  const columns = opts.columns || [];
  container.classList.toggle("columns", columns.length > 0);
  container.classList.toggle("wall", columns.length === 0);
  container.style.setProperty("--column-count", Math.max(columns.length, 1));

  if (!columns.length) {
    const cards = notes.map((n) => card(cache, n, opts));
    if (!cards.length && opts.emptyText) container.replaceChildren(el("p", "board-empty", opts.emptyText));
    else container.replaceChildren(...cards);
    if (opts.onResize) {
      wallTracks(container);
      watchWallWidth(container);
    }
    return;
  }

  const byColumn = new Map(columns.map((c) => [c.id, []]));
  for (const n of notes) (byColumn.get(n.column) || byColumn.get(columns[0].id)).push(n);

  container.replaceChildren(...columns.map((c) => {
    const section = el("section", "column");
    const head = el("h2", "column-head", c.name);
    head.append(el("span", "column-count", String(byColumn.get(c.id).length)));
    const list = el("div", "column-notes");
    const cards = byColumn.get(c.id).map((n) => card(cache, n, opts));
    if (cards.length) list.append(...cards);
    else if (opts.emptyText) list.append(el("p", "board-empty small", "No notes yet"));
    section.append(head, list);
    return section;
  }));
}
