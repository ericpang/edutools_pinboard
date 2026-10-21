// Firebase initialisation and all database reads/writes.
// Pin Board shares Live Word Cloud's database; everything here lives under /boards.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, remove, onValue,
  query, orderByChild, equalTo, serverTimestamp, runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { groupForSlot } from "./groups.js";

export const isConfigured = !Object.values(firebaseConfig).some((v) => String(v).includes("YOUR_"));

let auth, db;
if (isConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

/**
 * Sign in anonymously. Firebase persists the anonymous user in this browser and
 * returns the same one on later visits, so the presenter keeps ownership on refresh.
 */
export async function ready() {
  const { user } = await signInAnonymously(auth);
  return user.uid;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L

function randomCode(length = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const boardRef = (code, path = "") => ref(db, `boards/${code}${path ? "/" + path : ""}`);

/** Approved notes live in `posts`; notes awaiting approval or hidden by the presenter live in `pending`. */
export const POSTS = "posts";
export const PENDING = "pending";

export async function createBoard(uid, settings) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    if ((await get(boardRef(code, "meta"))).exists()) continue;
    await set(boardRef(code, "meta"), { ...settings, owner: uid, open: true, createdAt: serverTimestamp() });
    return code;
  }
  throw new Error("Could not allocate a board code. Please try again.");
}

export async function getMeta(code) {
  const snap = await get(boardRef(code, "meta"));
  return snap.exists() ? snap.val() : null;
}

/* ---------- Subscriptions (each returns an unsubscribe function) ---------- */

export function watchMeta(code, callback) {
  return onValue(boardRef(code, "meta"), (snap) => callback(snap.val()));
}

/** All approved notes. Participants may read these only once the board is revealed. */
export function watchPosts(code, callback, onError) {
  return onValue(boardRef(code, POSTS), (snap) => callback(snap.val() || {}), onError);
}

/** Presenter only: every note awaiting approval or hidden. */
export function watchPending(code, callback, onError) {
  return onValue(boardRef(code, PENDING), (snap) => callback(snap.val() || {}), onError);
}

/** Participant: this user's own notes in `posts` or `pending`. Allowed by the rules at any time. */
export function watchMine(code, where, uid, callback) {
  const q = query(boardRef(code, where), orderByChild("uid"), equalTo(uid));
  return onValue(q, (snap) => callback(snap.val() || {}));
}

export function watchLikes(code, callback) {
  return onValue(boardRef(code, "likes"), (snap) => callback(snap.val() || {}));
}

/** Presenter only: { uid: { group, slot, ts } } for everyone placed in a group. */
export function watchMembers(code, callback, onError) {
  return onValue(boardRef(code, "members"), (snap) => callback(snap.val() || {}), onError);
}

/* ---------- Participant writes ---------- */

/**
 * Place this participant in a group, or return the one they already have.
 * The slot counter is claimed in a transaction, so two people joining at once never share a slot.
 */
export async function joinGroup(code, uid, meta) {
  const mine = boardRef(code, `members/${uid}`);
  const existing = await get(mine);
  if (existing.exists()) return existing.val().group;

  const { committed, snapshot } = await runTransaction(boardRef(code, "joinCount"), (n) => (n || 0) + 1);
  if (!committed) throw new Error("Could not join a group.");
  const slot = snapshot.val() - 1;
  const group = groupForSlot(slot, meta.groups, meta.groupSeed || 0);
  try {
    await set(mine, { group, slot, ts: serverTimestamp() });
    return group;
  } catch (err) {
    // Another tab on this device got there first; use its group
    const again = await get(mine);
    if (again.exists()) return again.val().group;
    throw err;
  }
}

/** New notes go straight to `posts`, or to `pending` when approval mode is on. */
export function addPost(code, approval, { text, color, column, name, group, uid }) {
  const post = { text, color, uid, ts: serverTimestamp() };
  if (column) post.column = column;
  if (name) post.name = name;
  if (group) post.group = group;
  return push(boardRef(code, approval ? PENDING : POSTS), post);
}

export function editPost(code, where, id, { text, color, column }) {
  const fields = { text, color, editedAt: serverTimestamp() };
  if (column) fields.column = column;
  return update(boardRef(code, `${where}/${id}`), fields);
}

export const deletePost = (code, where, id) => remove(boardRef(code, `${where}/${id}`));

export function setLike(code, postId, uid, liked) {
  const r = boardRef(code, `likes/${postId}/${uid}`);
  return liked ? set(r, true) : remove(r);
}

/* ---------- Presenter writes ---------- */

export const updateMeta = (code, fields) => update(boardRef(code, "meta"), fields);

/** Strip client-only fields (id, likeCount) before writing a note back. */
function stored({ id, likeCount, hidden, ...post }) {
  return post;
}

export function approvePost(code, post) {
  return update(boardRef(code), {
    [`${PENDING}/${post.id}`]: null,
    [`${POSTS}/${post.id}`]: stored(post),
  });
}

export function approveAll(code, posts) {
  const changes = {};
  for (const post of posts) {
    changes[`${PENDING}/${post.id}`] = null;
    changes[`${POSTS}/${post.id}`] = stored(post);
  }
  return update(boardRef(code), changes);
}

/** Move a note off the board into `pending`, marked as hidden by the presenter. */
export function hidePost(code, post) {
  return update(boardRef(code), {
    [`${POSTS}/${post.id}`]: null,
    [`${PENDING}/${post.id}`]: { ...stored(post), highlighted: false, hidden: true },
  });
}

export const highlightPost = (code, id, on) => update(boardRef(code, `${POSTS}/${id}`), { highlighted: on });

export function removePost(code, where, id) {
  return update(boardRef(code), { [`${where}/${id}`]: null, [`likes/${id}`]: null });
}

export function clearBoard(code) {
  return update(boardRef(code), { [POSTS]: null, [PENDING]: null, likes: null });
}
