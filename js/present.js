// Presenter page: create/resume a board, show the QR code, render notes live, moderate.

import * as db from "./db.js";
import { toSortedList } from "./posts.js";
import { renderBoard, columnsOf, groupChip } from "./board.js";
import { chatList, renderChat } from "./chat.js";
import { MAX_GROUPS, groupCountOf, groupLabel, groupColor, memberNumber, randomSeed } from "./groups.js";

/** The colour a note shows: its group's colour in group mode, otherwise the one its author picked. */
const noteColor = (note) =>
  groupCountOf(state.meta) && note.group ? groupColor(note.group, state.meta.groupSeed) : note.color || "yellow";
import { initThemeToggle } from "./theme.js";
import { $, toast, show, storageGet, storageSet, boardCodeFromUrl } from "./ui.js";

const LAST_BOARD_KEY = "lastBoard";
const SORT_KEY = "pinboardSort";
const NOTE_SIZE_KEY = "pinboardNoteSize";
const PANEL_KEY = "pinboardPanelHidden";
const SIDEBAR_WIDTH_KEY = "pinboardSidebarWidth";
const NOTE_SIZES_KEY = "pinboardNoteSizes:"; // + board code
const TITLE_SIZE_KEY = "pinboardTitleSize";
const TITLE_MIN = 14;
const TITLE_MAX = 64;
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 640;
const DEFAULT_COLUMNS = ["Went well", "To improve", "Ideas"];
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 5;

const state = {
  code: null,
  uid: null,
  isOwner: false,
  meta: null,
  posts: {},
  pending: {},
  likes: {},
  members: {},         // { uid: { group, slot, name, ts } } for everyone placed in a group
  chat: {},            // every group's chat messages
  chatGroup: null,     // group whose chat is open in the dialog
  membersGroup: null,  // group whose member list is open in the dialog
  groupFilter: null,   // show only this group's notes
  sort: storageGet(SORT_KEY) || "newest",
  noteSizes: {},       // per-note sizes set by dragging, remembered per board in this browser
  printing: false,     // show note text while printing even if notes are hidden
  unwatchPosts: null,  // non-owner viewers can read posts only once revealed
};

initThemeToggle($("#theme-toggle"));
main().catch((err) => {
  console.error(err);
  toast(friendlyError(err), 6000);
});

async function main() {
  if (!db.isConfigured) {
    show($("#config-banner"));
    show($("#setup"));
    $("#start-btn").disabled = true;
    return;
  }

  state.uid = await db.ready();
  const code = boardCodeFromUrl();

  if (code) {
    const meta = await db.getMeta(code);
    if (meta) return startBoard(code, meta.owner === state.uid);
    toast(`Board ${code} was not found.`);
    history.replaceState(null, "", location.pathname);
  }
  showSetup();
}

/* ---------- Setup ---------- */

function showSetup() {
  show($("#setup"));
  $("#title-input").focus();

  const last = storageGet(LAST_BOARD_KEY);
  if (last) {
    const link = $("#resume-link");
    link.textContent = last;
    link.href = `?b=${encodeURIComponent(last)}`;
    show($("#resume"));
  }

  const groupsInput = $("#groups-input");
  groupsInput.append(new Option("Off", "0"));
  for (let n = 2; n <= MAX_GROUPS; n++) groupsInput.append(new Option(`${n} groups`, String(n)));
  const syncChatOption = () => show($("#chat-option"), Number(groupsInput.value) > 0);
  groupsInput.addEventListener("change", syncChatOption);
  syncChatOption();

  DEFAULT_COLUMNS.forEach((name) => addColumnInput(name));
  $("#add-column").addEventListener("click", () => addColumnInput("").querySelector("input").focus());
  for (const radio of document.querySelectorAll('input[name="layout"]')) {
    radio.addEventListener("change", syncLayoutChoice);
  }
  syncLayoutChoice();

  $("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#title-input").value.trim();
    if (!title) return;
    const layout = document.querySelector('input[name="layout"]:checked').value;
    const settings = {
      title,
      layout,
      approval: $("#approval-input").checked,
      revealed: !$("#reveal-input").checked,
      showNames: $("#names-input").checked,
      maxPerUser: Number($("#max-input").value),
    };
    const groups = Number(groupsInput.value);
    if (groups) Object.assign(settings, { groups, groupSeed: randomSeed(), chat: $("#chat-input").checked });
    if (layout === "columns") {
      const names = [...document.querySelectorAll("#column-inputs input")]
        .map((i) => i.value.trim().slice(0, 40))
        .filter(Boolean);
      if (names.length < MIN_COLUMNS) return toast(`Name at least ${MIN_COLUMNS} columns.`);
      settings.columns = Object.fromEntries(names.map((name, order) => [`c${order + 1}`, { name, order }]));
    }

    const btn = $("#start-btn");
    btn.disabled = true;
    btn.textContent = "Starting…";
    try {
      const code = await db.createBoard(state.uid, settings);
      history.replaceState(null, "", `?b=${code}`);
      show($("#setup"), false);
      startBoard(code, true);
    } catch (err) {
      console.error(err);
      toast(friendlyError(err), 6000);
      btn.disabled = false;
      btn.textContent = "Start board";
    }
  });
}

function syncLayoutChoice() {
  const columns = document.querySelector('input[name="layout"]:checked').value === "columns";
  show($("#columns-setup"), columns);
  for (const input of document.querySelectorAll("#column-inputs input")) input.required = columns;
}

function addColumnInput(value) {
  const list = $("#column-inputs");
  const li = document.createElement("li");
  const input = document.createElement("input");
  input.maxLength = 40;
  input.value = value;
  input.placeholder = "Column name";
  input.autocomplete = "off";
  input.setAttribute("aria-label", "Column name");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-btn small";
  remove.textContent = "✕";
  remove.title = "Remove column";
  remove.addEventListener("click", () => { li.remove(); syncColumnButtons(); });
  li.append(input, remove);
  list.append(li);
  syncColumnButtons();
  syncLayoutChoice();
  return li;
}

function syncColumnButtons() {
  const count = $("#column-inputs").children.length;
  $("#add-column").disabled = count >= MAX_COLUMNS;
  for (const btn of document.querySelectorAll("#column-inputs .icon-btn")) btn.disabled = count <= MIN_COLUMNS;
}

/* ---------- Board ---------- */

function startBoard(code, isOwner) {
  state.code = code;
  state.isOwner = isOwner;
  if (isOwner) storageSet(LAST_BOARD_KEY, code);
  try { state.noteSizes = JSON.parse(storageGet(NOTE_SIZES_KEY + code)) || {}; } catch { state.noteSizes = {}; }

  show($("#board"));
  show($("#join-pill"));
  $("#code").textContent = code;
  $("#pill-code").textContent = code;

  const joinUrl = new URL(`join.html?b=${code}`, location.href).href;
  $("#join-url").textContent = joinUrl.replace(/^https?:\/\//, "");
  renderQr(joinUrl);

  // Viewers who don't own the board (e.g. a second screen) get a read-only board
  show($("#controls"), isOwner);
  show($("#hint"), isOwner);
  wireControls();

  db.watchMeta(code, (meta) => {
    state.meta = meta || {};
    if (!isOwner) syncPostsListener();
    render();
  });
  db.watchLikes(code, (likes) => { state.likes = likes; render(); });
  if (isOwner) {
    db.watchPosts(code, (posts) => { state.posts = posts; render(); }, onActionError);
    db.watchPending(code, (pending) => { state.pending = pending; render(); }, onActionError);
    db.watchMembers(code, (members) => { state.members = members; render(); }, onActionError);
    db.watchAllChat(code, (chat) => { state.chat = chat; render(); }, onActionError);
  }
}

/** Read-only viewers may read notes only while the board is revealed. */
function syncPostsListener() {
  const revealed = state.meta.revealed !== false;
  if (revealed && !state.unwatchPosts) {
    state.unwatchPosts = db.watchPosts(state.code, (posts) => { state.posts = posts; render(); }, () => {
      state.unwatchPosts = null;
    });
  } else if (!revealed && state.unwatchPosts) {
    state.unwatchPosts();
    state.unwatchPosts = null;
    state.posts = {};
  }
}

function renderQr(url) {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  $("#qr").innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

function render() {
  const meta = state.meta;
  if (!meta) return;

  $("#title").textContent = meta.title || "";
  document.title = meta.title ? `${meta.title} · Live Pin Board` : "Live Pin Board";

  const open = meta.open !== false;
  const revealed = meta.revealed !== false;
  show($("#paused-badge"), !open);
  show($("#concealed-badge"), !revealed);
  show($("#approval-badge"), meta.approval === true);
  $("#pause-btn").textContent = open ? "⏸ Pause" : "▶ Resume";
  $("#reveal-btn").textContent = revealed ? "🙈 Hide notes" : "👁 Reveal";
  $("#reveal-btn").classList.toggle("primary", !revealed);
  $("#approval-btn").textContent = meta.approval ? "✋ Approval: on" : "✋ Approval: off";
  $("#names-btn").textContent = meta.showNames ? "👤 Names: on" : "👤 Names: off";

  const columns = columnsOf(meta);
  const groupCount = groupCountOf(meta);
  show($("#chat-btn"), groupCount > 0);
  $("#chat-btn").textContent = meta.chat === true ? "💬 Chat: on" : "💬 Chat: off";
  if (state.groupFilter > groupCount) state.groupFilter = null;
  const notes = toSortedList(state.posts, state.likes, state.sort);
  const shown = state.groupFilter ? notes.filter((n) => n.group === state.groupFilter) : notes;
  const filterBadge = $("#filter-badge");
  show(filterBadge, !!state.groupFilter);
  if (state.groupFilter) filterBadge.textContent = `Showing ${groupLabel(state.groupFilter)} only ✕`;

  renderBoard($("#notes"), shown, {
    columns,
    showNames: meta.showNames === true,
    showGroups: groupCount > 0,
    groupColor: groupCount > 0 ? (g) => groupColor(g, meta.groupSeed) : null,
    concealed: !revealed && !state.printing,
    actions: state.isOwner ? noteActions : null,
    onOpen: openNote,
    sizes: state.noteSizes,
    onResize: resizeNote,
    emptyText: state.groupFilter ? `No notes from ${groupLabel(state.groupFilter)} yet` : columns.length ? "No notes yet" : "",
  });
  show($("#empty"), shown.length === 0 && columns.length === 0 && !state.groupFilter);

  const pending = toSortedList(state.pending, {}, "oldest");
  const liveLikes = notes.reduce((sum, n) => sum + n.likeCount, 0);
  $("#stat-notes").textContent = notes.length;
  $("#stat-people").textContent = new Set([...notes, ...pending].map((n) => n.uid)).size;
  $("#stat-likes").textContent = liveLikes;

  renderPending(pending);
  renderGroups(groupCount, notes);
  renderChatDialog();
  renderMembersDialog();
}

/** Live size of each group, plus buttons to show one group's notes, see who is in it or open its chat. */
function renderGroups(groupCount, notes) {
  show($("#groups-panel"), state.isOwner && groupCount > 0);
  if (!state.isOwner || !groupCount) return;

  const sizes = new Array(groupCount + 1).fill(0);
  for (const m of Object.values(state.members)) if (m.group <= groupCount) sizes[m.group]++;
  const noteCounts = new Array(groupCount + 1).fill(0);
  for (const n of notes) if (n.group <= groupCount) noteCounts[n.group]++;
  const messageCounts = new Array(groupCount + 1).fill(0);
  for (const m of Object.values(state.chat)) if (m.group <= groupCount) messageCounts[m.group]++;
  const joined = sizes.reduce((a, b) => a + b, 0);
  $("#groups-total").textContent = `· ${joined} joined`;

  $("#group-list").replaceChildren(...Array.from({ length: groupCount }, (_, i) => {
    const group = i + 1;
    const pressed = state.groupFilter === group;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-row";
    btn.setAttribute("aria-pressed", String(pressed));
    btn.title = pressed ? "Show every group" : `Show only ${groupLabel(group)}'s notes`;
    const people = document.createElement("span");
    people.className = "group-size";
    people.textContent = `👤 ${sizes[group]}`;
    const count = document.createElement("small");
    count.className = "muted";
    count.textContent = `${noteCounts[group]} ${noteCounts[group] === 1 ? "note" : "notes"}`;
    btn.append(groupChip(group), people, count);
    btn.addEventListener("click", () => setGroupFilter(pressed ? null : group));

    const item = document.createElement("div");
    item.className = "group-item";
    item.append(btn, button("👥", "btn small", () => openMembers(group), `Who is in ${groupLabel(group)}`));
    if (state.meta.chat === true || messageCounts[group]) {
      item.append(button(`💬 ${messageCounts[group]}`, "btn small", () => openChat(group), `Open ${groupLabel(group)}'s chat`));
    }
    return item;
  }));
}

function setGroupFilter(group) {
  state.groupFilter = group;
  render();
}

/* ---------- Group members ---------- */

function openMembers(group) {
  state.membersGroup = group;
  renderMembersDialog();
  $("#members-dialog").showModal();
}

/** Who is in one group, by the name they gave when they joined, with how much each has contributed. */
function renderMembersDialog() {
  const group = state.membersGroup;
  if (!group) return;
  const groupCount = groupCountOf(state.meta);
  const count = (items, uid) => Object.values(items).filter((x) => x.uid === uid).length;
  const members = Object.entries(state.members)
    .filter(([, m]) => m.group === group)
    .sort(([, a], [, b]) => a.slot - b.slot);

  $("#members-dialog-title").replaceChildren(groupChip(group), ` · ${members.length} ${members.length === 1 ? "member" : "members"}`);
  $("#members-list").replaceChildren(...(members.length ? members.map(([uid, m]) => {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = m.name || `Member ${memberNumber(m.slot, groupCount)}`;
    const notes = count(state.posts, uid) + count(state.pending, uid);
    const stats = document.createElement("small");
    stats.className = "muted";
    stats.textContent = `${notes} ${notes === 1 ? "note" : "notes"} · ${count(state.chat, uid)} 💬`;
    li.append(name, stats);
    return li;
  }) : [Object.assign(document.createElement("li"), { className: "muted", textContent: "Nobody has joined yet" })]));
}

/* ---------- Group chat ---------- */

function openChat(group) {
  state.chatGroup = group;
  renderChatDialog();
  $("#chat-dialog").showModal();
}

/** Read-only transcript of one group's chat, with buttons to remove messages. */
function renderChatDialog() {
  const group = state.chatGroup;
  if (!group) return;
  const messages = chatList(state.chat).filter((m) => m.group === group);
  $("#chat-dialog-title").replaceChildren(groupChip(group), ` chat · ${messages.length} ${messages.length === 1 ? "message" : "messages"}`);
  $("#chat-clear-btn").disabled = messages.length === 0;
  renderChat($("#chat-dialog-log"), messages, {
    groupCount: groupCountOf(state.meta),
    emptyText: "No messages yet",
    actions: (m) => [["🗑", "Delete message", () => db.removeChat(state.code, [m.id]).catch(onActionError)]],
  });
}

function clearChat() {
  const ids = chatList(state.chat).filter((m) => m.group === state.chatGroup).map((m) => m.id);
  if (!ids.length || !confirm(`Delete all ${ids.length} messages in ${groupLabel(state.chatGroup)}'s chat? This cannot be undone.`)) return;
  db.removeChat(state.code, ids).then(() => toast("Chat cleared")).catch(onActionError);
}

function resizeNote(note, size, done) {
  if (size) state.noteSizes[note.id] = size;
  else delete state.noteSizes[note.id];
  if (!done) return;
  // Forget sizes of notes that no longer exist
  for (const id of Object.keys(state.noteSizes)) {
    if (!state.posts[id] && !state.pending[id]) delete state.noteSizes[id];
  }
  storageSet(NOTE_SIZES_KEY + state.code, JSON.stringify(state.noteSizes));
}

function noteActions(note) {
  return [
    [note.highlighted ? "★" : "☆", note.highlighted ? "Remove highlight" : "Highlight",
      () => db.highlightPost(state.code, note.id, !note.highlighted).catch(onActionError)],
    ["🙈", "Hide from the board", () => db.hidePost(state.code, note)
      .then(() => toast("Note hidden. Restore it from the sidebar."))
      .catch(onActionError)],
    ["🗑", "Delete", () => {
      if (!confirm("Delete this note? This cannot be undone.")) return;
      db.removePost(state.code, db.POSTS, note.id).catch(onActionError);
    }],
  ];
}

function renderPending(pending) {
  const panel = $("#pending-panel");
  show(panel, state.isOwner && (pending.length > 0 || state.meta.approval === true));
  $("#pending-count").textContent = pending.length;
  panel.querySelector("summary span").textContent = state.meta.approval ? "Waiting for approval" : "Hidden notes";
  const waiting = pending.filter((n) => !n.hidden);
  show($("#approve-all-btn"), waiting.length > 1);

  $("#pending-list").replaceChildren(...pending.map((note) => {
    const li = document.createElement("li");
    li.className = `pending-item note-${noteColor(note)}`;
    const text = document.createElement("p");
    text.textContent = note.text;
    const meta = document.createElement("small");
    const column = columnsOf(state.meta).find((c) => c.id === note.column);
    const group = groupCountOf(state.meta) && note.group ? groupLabel(note.group) : "";
    meta.textContent = [note.hidden ? "Hidden" : "Waiting", column?.name, group, state.meta.showNames && note.name]
      .filter(Boolean).join(" · ");
    const actions = document.createElement("div");
    actions.className = "pending-actions";
    actions.append(
      button(note.hidden ? "↩ Restore" : "✓ Approve", "btn small", () =>
        db.approvePost(state.code, note).catch(onActionError)),
      button("🗑", "btn small danger", () => {
        if (confirm("Delete this note? This cannot be undone.")) {
          db.removePost(state.code, db.PENDING, note.id).catch(onActionError);
        }
      }, "Delete"),
    );
    li.append(text, meta, actions);
    return li;
  }));
}

function button(label, className, onClick, title) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  btn.textContent = label;
  if (title) { btn.title = title; btn.setAttribute("aria-label", title); }
  btn.addEventListener("click", onClick);
  return btn;
}

function openNote(note) {
  const box = $("#dialog-note");
  box.className = `note big note-${noteColor(note)}`;
  const text = document.createElement("p");
  text.className = "note-text";
  text.textContent = note.text;
  const foot = document.createElement("footer");
  foot.className = "note-foot";
  const who = document.createElement("span");
  who.className = "note-name";
  if (groupCountOf(state.meta) && note.group) who.append(groupChip(note.group));
  if (state.meta.showNames && note.name) who.append(document.createTextNode(note.name));
  const likes = document.createElement("span");
  likes.className = "like";
  likes.textContent = `♥ ${note.likeCount || 0}`;
  foot.append(who, likes);
  box.replaceChildren(text, foot);
  $("#note-dialog").showModal();
}

/* ---------- Controls ---------- */

function wireControls() {
  const sort = $("#sort-input");
  sort.value = state.sort;
  sort.addEventListener("change", () => {
    state.sort = sort.value;
    storageSet(SORT_KEY, state.sort);
    render();
  });

  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) e.currentTarget.close(); // click on the backdrop
    });
  }
  $("#chat-dialog").addEventListener("close", () => { state.chatGroup = null; });
  $("#members-dialog").addEventListener("close", () => { state.membersGroup = null; });

  $("#filter-badge").addEventListener("click", () => setGroupFilter(null));

  wireNoteSize();
  wirePanelToggle();
  wireSplitter();
  wireTitleResize();

  if (!state.isOwner) return;

  const toggleMeta = (field, fallback, messages) => () => {
    const next = !(state.meta[field] ?? fallback);
    db.updateMeta(state.code, { [field]: next })
      .then(() => toast(messages[next ? 1 : 0]))
      .catch(onActionError);
  };

  $("#pause-btn").addEventListener("click",
    toggleMeta("open", true, ["Posting paused", "Posting open"]));
  $("#reveal-btn").addEventListener("click",
    toggleMeta("revealed", true, ["Notes hidden. Students see only their own.", "Notes revealed to everyone"]));
  $("#approval-btn").addEventListener("click",
    toggleMeta("approval", false, ["Approval mode off: new notes appear straight away", "Approval mode on: new notes wait for you"]));
  $("#names-btn").addEventListener("click",
    toggleMeta("showNames", false, ["Names hidden", "Names shown"]));
  $("#chat-btn").addEventListener("click",
    toggleMeta("chat", false, ["Group chat off", "Group chat on"]));
  $("#chat-clear-btn").addEventListener("click", clearChat);

  $("#approve-all-btn").addEventListener("click", () => {
    const waiting = toSortedList(state.pending).filter((n) => !n.hidden);
    db.approveAll(state.code, waiting)
      .then(() => toast(`Approved ${waiting.length} notes`))
      .catch(onActionError);
  });

  $("#qr-btn").addEventListener("click", () => {
    const panel = $("#qr-panel");
    const hide = !panel.hidden;
    show(panel, !hide);
    $("#board").classList.toggle("qr-hidden", hide);
    $("#qr-btn").textContent = hide ? "Show QR" : "Hide QR";
  });

  $("#clear-btn").addEventListener("click", () => {
    const what = groupCountOf(state.meta) ? "notes, likes and group chats" : "notes and likes";
    if (!confirm(`Delete all ${what}? This cannot be undone.`)) return;
    db.clearBoard(state.code).then(() => toast("Board cleared")).catch(onActionError);
  });

  $("#fullscreen-btn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  });

  // Print the real note text even while notes are hidden from students
  window.addEventListener("beforeprint", () => { state.printing = true; render(); });
  window.addEventListener("afterprint", () => { state.printing = false; render(); });
  $("#print-btn").addEventListener("click", () => window.print());

  $("#csv-btn").addEventListener("click", exportCsv);
}

/* ---------- Layout: note size, side panel ---------- */

function wireNoteSize() {
  const input = $("#size-input");
  const apply = () => $("#notes-wrap").style.setProperty("--note-scale", input.value);
  input.value = storageGet(NOTE_SIZE_KEY) || "1";
  apply();
  input.addEventListener("input", () => {
    apply();
    storageSet(NOTE_SIZE_KEY, input.value);
  });
}

/** Drag (or use arrow keys on) the bar under the toolbar to make the title bigger or smaller. */
function wireTitleResize() {
  const board = $("#board");
  const grip = $("#header-grip");
  const title = $("#title");

  const currentSize = () => parseFloat(getComputedStyle(title).fontSize);
  const setSize = (px, save = true) => {
    if (px == null) {
      board.style.removeProperty("--title-size");
      if (save) storageSet(TITLE_SIZE_KEY, "");
    } else {
      const size = Math.round(Math.min(TITLE_MAX, Math.max(TITLE_MIN, px)));
      board.style.setProperty("--title-size", `${size}px`);
      if (save) storageSet(TITLE_SIZE_KEY, String(size));
    }
    grip.setAttribute("aria-valuenow", String(Math.round(currentSize())));
  };

  const saved = Number(storageGet(TITLE_SIZE_KEY));
  if (saved) setSize(saved, false);
  grip.setAttribute("aria-valuemin", String(TITLE_MIN));
  grip.setAttribute("aria-valuemax", String(TITLE_MAX));

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add("dragging");
    board.classList.add("resizing-header");
    const startY = e.clientY;
    const startSize = currentSize();
    const move = (ev) => setSize(startSize + (ev.clientY - startY) / 1.3, false);
    const end = () => {
      grip.removeEventListener("pointermove", move);
      grip.classList.remove("dragging");
      board.classList.remove("resizing-header");
      setSize(currentSize());
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", end, { once: true });
    grip.addEventListener("pointercancel", end, { once: true });
  });

  grip.addEventListener("dblclick", () => setSize(null));
  grip.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 8 : 2;
    if (e.key === "ArrowDown") setSize(currentSize() + step);
    else if (e.key === "ArrowUp") setSize(currentSize() - step);
    else if (e.key === "Home") setSize(TITLE_MAX);
    else if (e.key === "End") setSize(TITLE_MIN);
    else return;
    e.preventDefault();
  });
}

function wirePanelToggle() {
  const btn = $("#panel-btn");
  const apply = (hidden) => {
    $("#board").classList.toggle("panel-hidden", hidden);
    btn.textContent = hidden ? "⇤ Show panel" : "Hide panel ⇥";
    btn.setAttribute("aria-expanded", String(!hidden));
  };
  apply(storageGet(PANEL_KEY) === "1");
  btn.addEventListener("click", () => {
    const hidden = !$("#board").classList.contains("panel-hidden");
    apply(hidden);
    storageSet(PANEL_KEY, hidden ? "1" : "0");
  });
}

/** Drag (or use arrow keys on) the bar between the board and the side panel to resize them. */
function wireSplitter() {
  const board = $("#board");
  const splitter = $("#splitter");
  const sidebar = $("#sidebar");

  const maxWidth = () => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, board.clientWidth * 0.6));
  const setWidth = (px, save = true) => {
    if (px == null) {
      board.style.removeProperty("--sidebar-width");
      if (save) storageSet(SIDEBAR_WIDTH_KEY, "");
    } else {
      const width = Math.round(Math.min(maxWidth(), Math.max(SIDEBAR_MIN, px)));
      board.style.setProperty("--sidebar-width", `${width}px`);
      if (save) storageSet(SIDEBAR_WIDTH_KEY, String(width));
    }
    splitter.setAttribute("aria-valuenow", String(Math.round(sidebar.getBoundingClientRect().width)));
  };

  const saved = Number(storageGet(SIDEBAR_WIDTH_KEY));
  if (saved) setWidth(saved, false);
  splitter.setAttribute("aria-valuemin", String(SIDEBAR_MIN));
  splitter.setAttribute("aria-valuemax", String(SIDEBAR_MAX));

  splitter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add("dragging");
    board.classList.add("resizing");
    const startX = e.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;
    const move = (ev) => setWidth(startWidth + (startX - ev.clientX), false);
    const end = () => {
      splitter.removeEventListener("pointermove", move);
      splitter.classList.remove("dragging");
      board.classList.remove("resizing");
      setWidth(sidebar.getBoundingClientRect().width);
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", end, { once: true });
    splitter.addEventListener("pointercancel", end, { once: true });
  });

  splitter.addEventListener("dblclick", () => setWidth(null));
  splitter.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 60 : 20;
    const width = sidebar.getBoundingClientRect().width;
    if (e.key === "ArrowLeft") setWidth(width + step);
    else if (e.key === "ArrowRight") setWidth(width - step);
    else if (e.key === "Home") setWidth(SIDEBAR_MAX);
    else if (e.key === "End") setWidth(SIDEBAR_MIN);
    else return;
    e.preventDefault();
  });
}

function exportCsv() {
  const columns = new Map(columnsOf(state.meta).map((c) => [c.id, c.name]));
  const rows = [["column", "group", "text", "name", "likes", "status", "highlighted", "participant", "created_at", "edited_at"]];
  const all = [
    ...toSortedList(state.posts, state.likes, "oldest").map((n) => ({ ...n, status: "approved" })),
    ...toSortedList(state.pending, {}, "oldest").map((n) => ({ ...n, status: n.hidden ? "hidden" : "waiting" })),
  ];
  for (const n of all) {
    rows.push([
      columns.get(n.column) || "",
      n.group ? groupLabel(n.group) : "",
      n.text,
      n.name || "",
      n.likeCount || 0,
      n.status,
      n.highlighted ? "yes" : "",
      n.uid.slice(0, 8),
      new Date(n.ts).toISOString(),
      n.editedAt ? new Date(n.editedAt).toISOString() : "",
    ]);
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `pinboard-${state.code}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onActionError(err) {
  console.error(err);
  toast(friendlyError(err), 5000);
}

function friendlyError(err) {
  const msg = String(err?.code || err?.message || err);
  if (msg.includes("operation-not-allowed")) return "Enable Anonymous sign-in in Firebase Authentication.";
  if (msg.includes("unauthorized-domain")) return "Add this domain to Firebase Authentication → Authorized domains.";
  if (msg.includes("are-blocked")) return "This address is blocked by the API key's website restrictions in Google Cloud Console. See the README's troubleshooting table.";
  if (msg.toLowerCase().includes("permission")) return "Permission denied. Check that the combined database rules are published.";
  return "Something went wrong. Check the browser console for details.";
}
