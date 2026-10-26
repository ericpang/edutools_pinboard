// Participant page: enter a code (or arrive via QR), give a name and get placed in a group, add/edit/delete
// notes, see the board, like.

import * as db from "./db.js";
import { validate, cleanName, toSortedList, COLORS, MAX_LEN } from "./posts.js";
import { renderBoard, columnsOf } from "./board.js";
import { validateMessage, chatList, renderChat, memberLabel } from "./chat.js";
import { groupCountOf, groupLabel, groupHue, groupColor, memberNumber } from "./groups.js";
import { initThemeToggle } from "./theme.js";
import { $, toast, show, storageGet, storageSet, boardCodeFromUrl } from "./ui.js";

const NAME_KEY = "pinboardName";
const COLOR_KEY = "pinboardColor";
const CHAT_NAME_KEY = "pinboardChatName";
const CHAT_OPEN_KEY = "pinboardChatOpen";
const CHAT_SEEN_KEY = "pinboardChatSeen:"; // + board code

const state = {
  code: null,
  uid: null,
  meta: undefined,  // undefined = loading, null = not found
  posts: {},        // every approved note (only while the board is revealed)
  myPosts: {},      // this participant's approved notes
  myPending: {},    // this participant's notes awaiting approval or hidden
  likes: {},
  group: null,      // this participant's group number, once assigned
  slot: null,       // their join slot, which tells the members of a group apart in chat
  looked: false,    // whether the database has been asked if they already have a group
  joining: null,    // promise while looking for or being placed in a group
  groupFailed: false,
  chat: {},         // messages in this participant's group
  chatSeen: 0,      // timestamp of the newest message from others that they have read
  unwatchChat: null,
  color: storageGet(COLOR_KEY) || COLORS[0],
  column: null,
  editing: null,    // { id, where } while editing one of your notes
  submitting: false,
  unwatchPosts: null,
};

initThemeToggle($("#theme-toggle"));
main().catch((err) => {
  console.error(err);
  showMessage("⚠️", "Couldn't connect", "Check your internet connection and try again.");
});

async function main() {
  if (!db.isConfigured) return show($("#config-banner"));

  const code = boardCodeFromUrl();
  if (!code) return showCodeEntry();

  state.code = code;
  state.uid = await db.ready();
  state.chatSeen = Number(storageGet(CHAT_SEEN_KEY + code)) || 0;
  $("#board-code").textContent = code;

  db.watchMeta(code, (meta) => {
    state.meta = meta;
    if (meta) {
      syncPostsListener();
      syncChatListener();
      if (groupCountOf(meta) && !state.groupFailed) findGroup();
    }
    render();
  });
  db.watchMine(code, db.POSTS, state.uid, (posts) => { state.myPosts = posts; render(); });
  db.watchMine(code, db.PENDING, state.uid, (posts) => { state.myPending = posts; render(); });
  db.watchLikes(code, (likes) => { state.likes = likes; render(); });

  wireForm();
  wireChat();
  wireJoin();
}

/** The rules let participants read everyone's notes only while the board is revealed. */
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

/**
 * Once the board is known, see whether this phone already has a group; rejoining keeps it. If not, the
 * join card asks for a name, and joinGroup places the person. After a failure nothing is retried until
 * the page is reloaded.
 */
function findGroup() {
  if (state.group || state.joining || state.looked) return;
  track(db.findMembership(state.code, state.uid).then((found) => {
    state.looked = true;
    if (found) placed(found);
  }));
}

function joinGroup(name) {
  if (state.group || state.joining) return;
  track(db.joinGroup(state.code, state.uid, state.meta, name).then(placed));
}

/** Run one lookup or join at a time, and re-render when it settles. */
function track(promise) {
  state.joining = promise
    .catch((err) => {
      console.error(err);
      state.groupFailed = true;
      toast("Couldn't place you in a group. Reload the page to try again.", 5000);
    })
    .finally(() => { state.joining = null; render(); });
}

function placed({ group, slot, name }) {
  state.group = group;
  state.slot = slot;
  state.groupFailed = false;
  if (name) setName(name);
  syncChatListener();
}

/** One name for the join card, notes and chat. */
function setName(name) {
  $("#join-name").value = name;
  $("#name-input").value = name;
  $("#chat-name").value = name;
  storageSet(NAME_KEY, name);
}

/** Read this group's chat while the presenter has chat on and the person has a group. */
function syncChatListener() {
  const wanted = state.meta?.chat === true && groupCountOf(state.meta) > 0 && !!state.group;
  if (wanted && !state.unwatchChat) {
    state.unwatchChat = db.watchChat(state.code, state.group, (chat) => { state.chat = chat; renderChatLog(); }, () => {
      state.unwatchChat = null;
    });
  } else if (!wanted && state.unwatchChat) {
    state.unwatchChat();
    state.unwatchChat = null;
    state.chat = {};
  }
}

function showCodeEntry() {
  show($("#enter-code"));
  const input = $("#code-input");
  input.focus();
  $("#code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (code.length === 6) location.search = `?b=${code}`;
  });
}

function showMessage(emoji, title, body) {
  show($("#session"), false);
  show($("#message"));
  $("#message-emoji").textContent = emoji;
  $("#message-title").textContent = title;
  $("#message-body").textContent = body;
}

const limit = () => state.meta?.maxPerUser || Infinity; // 0 = unlimited
const used = () => Object.keys(state.myPosts).length + Object.keys(state.myPending).length;

/* ---------- Rendering ---------- */

function render() {
  const { meta } = state;
  if (meta === null) {
    return showMessage("🔍", "Board not found", `There's no board with code ${state.code}. Check the code and try again.`);
  }
  if (!meta) return;

  show($("#message"), false);
  show($("#session"));
  $("#title").textContent = meta.title;
  document.title = `${meta.title} · Live Pin Board`;

  renderGroup(meta);
  renderChatCard(meta);
  renderForm(meta);
  renderNotes(meta);
}

/** With groups on, notes and chat wait until the person has given a name and been placed. */
function renderGroup(meta) {
  const card = $("#group-card");
  const grouped = groupCountOf(meta) > 0;
  const needsName = grouped && state.looked && !state.group && !state.groupFailed;
  show($("#join-card"), needsName);
  $("#join-btn").disabled = !!state.joining;
  show($("#post-card"), !grouped || !!state.group);
  show(card, grouped && !needsName);
  if (!grouped) return;
  const name = $("#group-name");
  name.textContent = state.group ? groupLabel(state.group)
    : state.groupFailed ? "Couldn't find your group" : "Finding your group…";
  card.classList.toggle("assigned", !!state.group);
  if (state.group) card.style.setProperty("--group-hue", groupHue(state.group));
}

/** The group chat is offered while the presenter has chat on. */
function renderChatCard(meta) {
  const groups = groupCountOf(meta);
  const card = $("#chat-card");
  show(card, meta.chat === true && groups > 0 && !!state.group);
  if (card.hidden) return;

  const number = memberNumber(state.slot, groups);
  const you = memberLabel(cleanName($("#chat-name").value), number);
  $("#chat-hint").textContent = `Only ${groupLabel(state.group)} can read this chat. You appear as ${you}.`;
  $("#chat-name").placeholder = `Member ${number}`;
}

function renderChatLog() {
  const messages = chatList(state.chat);
  renderChat($("#chat-log"), messages, {
    groupCount: groupCountOf(state.meta),
    myUid: state.uid,
    onLike: (m, liked) => db.setChatLike(state.code, m.id, state.uid, liked, {
      slot: state.slot,
      name: cleanName($("#chat-name").value),
    }).catch(chatFailed),
    emptyText: "No messages yet. Say hello! 👋",
  });

  if ($("#chat-card").open) markChatRead(messages);
  const unread = messages.filter((m) => m.uid !== state.uid && m.ts > state.chatSeen).length;
  $("#chat-unread").textContent = unread;
  show($("#chat-unread"), unread > 0);
}

/** Remember how far the person has read, so reopening the page doesn't flag old messages as new. */
function markChatRead(messages) {
  const newest = messages.reduce((t, m) => (m.uid !== state.uid ? Math.max(t, m.ts) : t), state.chatSeen);
  if (newest === state.chatSeen) return;
  state.chatSeen = newest;
  storageSet(CHAT_SEEN_KEY + state.code, String(newest));
}

function renderForm(meta) {
  const open = meta.open !== false;
  const left = limit() - used();
  const done = left <= 0 && !state.editing;
  const disabled = !open || done;

  $("#remaining").textContent = Number.isFinite(left) ? `${Math.max(left, 0)} of ${limit()} left` : "";
  $("#note-text").disabled = disabled;
  $("#submit-btn").disabled = disabled || state.submitting;
  $("#submit-btn").textContent = state.editing ? "💾 Save changes" : "📌 Pin it";
  show($("#edit-banner"), !!state.editing);
  show($("#name-field"), meta.showNames === true && !state.editing);

  renderColumnChoices(columnsOf(meta), disabled);
  show($("#color-field"), groupCountOf(meta) === 0); // in group mode the group decides the colour
  for (const btn of document.querySelectorAll("#color-choices button")) {
    btn.disabled = disabled;
    btn.setAttribute("aria-checked", String(btn.dataset.color === state.color));
  }

  if (!open) setStatus("Posting is paused. You can still read the board.", "");
  else if (done) setStatus("Thanks! You've pinned all your notes. 🎉", "ok");
  else if ($("#status").dataset.sticky !== "1") setStatus("", "");
}

function renderColumnChoices(columns, disabled) {
  show($("#column-field"), columns.length > 0);
  if (!columns.length) return;
  if (!columns.some((c) => c.id === state.column)) state.column = columns[0].id;

  const box = $("#column-choices");
  box.replaceChildren(...columns.map((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.textContent = c.name;
    btn.disabled = disabled;
    btn.setAttribute("aria-checked", String(c.id === state.column));
    btn.addEventListener("click", () => { state.column = c.id; render(); });
    return btn;
  }));
}

function renderNotes(meta) {
  const revealed = meta.revealed !== false;
  const open = meta.open !== false;

  // Merge everything this phone may see, tagging where each note lives
  const merged = {};
  for (const [id, p] of Object.entries(state.posts)) merged[id] = { ...p, where: db.POSTS };
  for (const [id, p] of Object.entries(state.myPosts)) merged[id] = { ...p, where: db.POSTS };
  for (const [id, p] of Object.entries(state.myPending)) {
    merged[id] = { ...p, where: db.PENDING, status: p.hidden ? "Hidden by teacher" : "Waiting for approval" };
  }
  const notes = toSortedList(merged, state.likes, "newest");

  $("#board-heading").textContent = revealed ? "Board" : "Your notes";
  const boardNote = $("#board-note");
  boardNote.textContent = revealed ? "" : "🙈 Notes are hidden until your teacher reveals them. For now you can see only your own.";
  show(boardNote, !revealed);

  renderBoard($("#notes"), notes, {
    columns: columnsOf(meta),
    showNames: meta.showNames === true,
    showGroups: groupCountOf(meta) > 0,
    groupColor: groupCountOf(meta) > 0 ? (g) => groupColor(g, meta.groupSeed) : null,
    myUid: state.uid,
    emptyText: revealed ? "No notes yet. Be the first!" : "You haven't pinned anything yet.",
    likedByMe: (n) => state.likes[n.id]?.[state.uid] === true,
    onLike: (n, liked) => db.setLike(state.code, n.id, state.uid, liked).catch(onError),
    actions: (n) => {
      if (n.uid !== state.uid || !open) return [];
      // In approval mode an approved note can't be edited, or it would skip moderation
      const editable = n.where === db.PENDING || meta.approval !== true;
      return [
        ...(editable ? [["✏️", "Edit your note", () => startEdit(n)]] : []),
        ["🗑", "Delete your note", () => deleteNote(n)],
      ];
    },
  });
}

/* ---------- Form ---------- */

function setStatus(text, kind, sticky = false) {
  const el = $("#status");
  el.textContent = text;
  el.className = `status ${kind}`;
  el.dataset.sticky = sticky ? "1" : "";
}

function wireForm() {
  const input = $("#note-text");
  const counter = $("#char-count");
  const updateCounter = () => { counter.textContent = `${input.value.length}/${MAX_LEN}`; };
  input.addEventListener("input", () => { updateCounter(); setStatus("", ""); });

  $("#color-choices").replaceChildren(...COLORS.map((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.className = `swatch note-${color}`;
    btn.dataset.color = color;
    btn.title = color[0].toUpperCase() + color.slice(1);
    btn.setAttribute("aria-label", btn.title);
    btn.addEventListener("click", () => {
      state.color = color;
      storageSet(COLOR_KEY, color);
      render();
    });
    return btn;
  }));

  const nameInput = $("#name-input");
  nameInput.value = storageGet(NAME_KEY) || storageGet(CHAT_NAME_KEY) || "";
  nameInput.addEventListener("change", () => storageSet(NAME_KEY, cleanName(nameInput.value)));
  // One name for notes and chat: typing in either field fills in the other
  nameInput.addEventListener("input", () => {
    $("#chat-name").value = nameInput.value;
    if (state.meta) renderChatCard(state.meta);
  });

  $("#cancel-edit").addEventListener("click", () => stopEdit());

  $("#note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.submitting) return;

    const result = validate(input.value);
    if (!result.ok) return setStatus(result.error, "error", true);
    if (!state.editing && used() >= limit()) return;
    if (groupCountOf(state.meta) && !state.group) return setStatus("Join your group first.", "error", true);

    state.submitting = true;
    render();
    try {
      const color = groupCountOf(state.meta) && state.group
        ? groupColor(state.group, state.meta.groupSeed) : state.color;
      const fields = { text: result.text, color, column: state.column };
      if (state.editing) {
        await db.editPost(state.code, state.editing.where, state.editing.id, fields);
        stopEdit();
        setStatus("Saved! ✏️", "ok", true);
      } else {
        const name = state.meta.showNames ? cleanName(nameInput.value) : "";
        await db.addPost(state.code, state.meta.approval === true, { ...fields, name, group: state.group, uid: state.uid });
        input.value = "";
        setStatus(state.meta.approval
          ? "Sent! Your note will appear once your teacher approves it."
          : "Pinned! 📌", "ok", true);
      }
      updateCounter();
    } catch (err) {
      console.error(err);
      const denied = String(err?.code || err?.message).toLowerCase().includes("permission");
      setStatus(denied ? "Posting is paused right now." : "Couldn't send. Check your connection and try again.", "error", true);
    } finally {
      state.submitting = false;
      render();
    }
  });
}

/** The name asked for when joining a group; it is the one shown to the presenter in the group's member list. */
function wireJoin() {
  const input = $("#join-name");
  input.value = storageGet(NAME_KEY) || storageGet(CHAT_NAME_KEY) || "";
  $("#join-card").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    const error = $("#join-error");
    error.textContent = name ? "" : input.value.trim() ? "Please choose a different name." : "Please enter your name.";
    if (name) joinGroup(name);
  });
}

function wireChat() {
  const card = $("#chat-card");
  card.open = storageGet(CHAT_OPEN_KEY) === "1";
  card.addEventListener("toggle", () => {
    storageSet(CHAT_OPEN_KEY, card.open ? "1" : "0");
    if (!card.open) return;
    renderChatLog();
    const log = $("#chat-log");
    log.scrollTop = log.scrollHeight;
  });

  const nameInput = $("#chat-name");
  nameInput.value = $("#name-input").value;
  nameInput.addEventListener("input", () => {
    $("#name-input").value = nameInput.value;
    if (state.meta) renderChatCard(state.meta);
  });
  nameInput.addEventListener("change", () => storageSet(NAME_KEY, cleanName(nameInput.value)));
  nameInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); // carry on to the message instead of sending an empty one
    $("#chat-message").focus();
  });

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage();
  });
}

/** The message shows up at once; if the database refuses it, it vanishes again and the text comes back. */
function sendMessage() {
  const input = $("#chat-message");
  if (!state.group) return;

  const result = validateMessage(input.value);
  if (!result.ok) return toast(result.error);

  input.value = "";
  db.sendChat(state.code, {
    uid: state.uid,
    group: state.group,
    slot: state.slot,
    name: cleanName($("#chat-name").value),
    text: result.text,
  }).catch((err) => {
    if (!input.value) input.value = result.text;
    chatFailed(err);
  });

  const log = $("#chat-log");
  log.scrollTop = log.scrollHeight;
}

/** A message or thumbs up that the database refused or couldn't deliver. */
function chatFailed(err) {
  console.error(err);
  const denied = String(err?.code || err?.message).toLowerCase().includes("permission");
  toast(denied ? "Chat is switched off right now." : "Couldn't send. Check your connection and try again.", 4000);
}

function startEdit(note) {
  state.editing = { id: note.id, where: note.where };
  state.color = note.color;
  if (note.column) state.column = note.column;
  const input = $("#note-text");
  input.value = note.text;
  $("#char-count").textContent = `${input.value.length}/${MAX_LEN}`;
  setStatus("", "");
  render();
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
}

function stopEdit() {
  state.editing = null;
  state.color = storageGet(COLOR_KEY) || COLORS[0];
  $("#note-text").value = "";
  $("#char-count").textContent = `0/${MAX_LEN}`;
  render();
}

async function deleteNote(note) {
  if (!confirm("Delete your note?")) return;
  try {
    await db.deletePost(state.code, note.where, note.id);
    if (state.editing?.id === note.id) stopEdit();
    toast("Note deleted");
  } catch (err) { onError(err); }
}

function onError(err) {
  console.error(err);
  const denied = String(err?.code || err?.message).toLowerCase().includes("permission");
  toast(denied ? "Not allowed right now. The board may be paused." : "Something went wrong. Try again.", 4000);
}
