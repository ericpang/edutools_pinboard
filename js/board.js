// Shared rendering of notes as cards, in Wall or Columns layout.
// Card elements are reused between renders, so only new notes play the pop-in animation.

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

function el(tag, className, text) {
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

/**
 * Build or update one card.
 * @param {object} note  { id, text, color, name, likeCount, highlighted, uid, editedAt, status }
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

  if (opts.concealed) {
    node.replaceChildren(el("span", "note-back", "?"));
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
  node.replaceChildren(...children);
  return node;
}

/**
 * Render notes into `container`.
 * @param {HTMLElement} container
 * @param {object[]} notes  already sorted
 * @param {object} opts
 *   columns     [{id, name}] for Columns layout, [] for Wall
 *   showNames   show author names
 *   myUid       marks the viewer's own notes
 *   concealed   show card backs only (reveal mode on the projector)
 *   actions     note → [[label, title, onClick], ...] extra buttons per note
 *   onLike      (note, liked) → void; omit for read-only like counts
 *   likedByMe   note → boolean
 *   onOpen      note → void; click a card to enlarge it
 *   emptyText   message for an empty wall or column
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
