// Participant page: enter a code (or arrive via QR), add/edit/delete notes, see the board, like.

import * as db from "./db.js";
import { validate, cleanName, toSortedList, COLORS, MAX_LEN } from "./posts.js";
import { renderBoard, columnsOf } from "./board.js";
import { initThemeToggle } from "./theme.js";
import { $, toast, show, storageGet, storageSet, boardCodeFromUrl } from "./ui.js";

const NAME_KEY = "pinboardName";
const COLOR_KEY = "pinboardColor";

const state = {
  code: null,
  uid: null,
  meta: undefined,  // undefined = loading, null = not found
  posts: {},        // every approved note (only while the board is revealed)
  myPosts: {},      // this participant's approved notes
  myPending: {},    // this participant's notes awaiting approval or hidden
  likes: {},
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
  $("#board-code").textContent = code;

  db.watchMeta(code, (meta) => {
    state.meta = meta;
    if (meta) syncPostsListener();
    render();
  });
  db.watchMine(code, db.POSTS, state.uid, (posts) => { state.myPosts = posts; render(); });
  db.watchMine(code, db.PENDING, state.uid, (posts) => { state.myPending = posts; render(); });
  db.watchLikes(code, (likes) => { state.likes = likes; render(); });

  wireForm();
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

  renderForm(meta);
  renderNotes(meta);
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
  nameInput.value = storageGet(NAME_KEY) || "";
  nameInput.addEventListener("change", () => storageSet(NAME_KEY, cleanName(nameInput.value)));

  $("#cancel-edit").addEventListener("click", () => stopEdit());

  $("#note-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.submitting) return;

    const result = validate(input.value);
    if (!result.ok) return setStatus(result.error, "error", true);
    if (!state.editing && used() >= limit()) return;

    const fields = { text: result.text, color: state.color, column: state.column };
    state.submitting = true;
    render();
    try {
      if (state.editing) {
        await db.editPost(state.code, state.editing.where, state.editing.id, fields);
        stopEdit();
        setStatus("Saved! ✏️", "ok", true);
      } else {
        const name = state.meta.showNames ? cleanName(nameInput.value) : "";
        await db.addPost(state.code, state.meta.approval === true, { ...fields, name, uid: state.uid });
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
