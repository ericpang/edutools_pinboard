# Live Pin Board

A real-time, shared pin board for classrooms, workshops and meetings.
The presenter puts a question and a QR code on the screen; participants scan it
with their phones and pin short notes to the board; every note appears live on
the projector and on everyone's phone.

Think of it as a wall of sticky notes that the whole class writes on at once:
exit tickets, brainstorming, "What I know / What I want to know", retrospectives,
questions for a guest speaker, or peer feedback.

- **Hosted for free on GitHub Pages**: static HTML, CSS and JS with no build step
- **Real-time sync** through Firebase Realtime Database (free Spark plan), sharing the **same database** as Live Word Cloud. No new Firebase project or database is needed
- **Text-only notes**: simple, fast and free, with no photo uploads
- **Two layouts**: a free-flowing *Wall* or labelled *Columns*
- **Likes, moderation and reveal mode** so the teacher stays in control
- **Day and night themes** that follow the device setting, with a manual toggle
- **QR code join**: no app install and no participant login

> Items marked *(planned)* in the [Roadmap](#roadmap) are not built yet.

---

## Table of contents

1. [How it works](#how-it-works)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Data model](#data-model)
6. [Security rules](#security-rules)
7. [Setup](#setup)
8. [Deploying to GitHub Pages](#deploying-to-github-pages)
9. [Using the app](#using-the-app)
10. [Theming](#theming)
11. [Post rules](#post-rules)
12. [Limits and troubleshooting](#limits-and-troubleshooting)
13. [Roadmap](#roadmap)

---

## How it works

GitHub Pages only serves static files, so a hosted real-time database receives
and shares the posts. Every browser connects directly to Firebase:

```
 ┌──────────────────────┐          ┌──────────────────────────┐
 │  Presenter screen    │          │  Participant phones      │
 │  index.html          │          │  join.html?b=ABC123      │
 │  - question + QR     │          │  - question              │
 │  - live board        │          │  - "Add a note" form     │
 │  - moderation tools  │          │  - live board (read)     │
 └─────────┬────────────┘          └────────────┬─────────────┘
           │  subscribe + moderate              │  add / edit own note, like
           ▼                                    ▼
      ┌─────────────────────────────────────────────────┐
      │      Firebase Realtime Database (free tier)     │
      │      /boards/ABC123/{meta, posts, likes}        │
      └─────────────────────────────────────────────────┘
                 ▲
                 │  static files only
      ┌──────────┴──────────┐
      │    GitHub Pages     │
      └─────────────────────┘
```

1. The presenter opens the site, types a question, picks a layout and clicks
   **Start board**. The app generates a 6-character code (for example `ABC123`)
   and a QR code pointing to `https://<user>.github.io/<repo>/join.html?b=ABC123`.
2. Participants scan the QR code (or type the code) and add notes.
3. Each note is written to `/boards/ABC123/posts`.
4. The presenter's screen and every phone listen for changes and show new notes
   within about a second.

### How it differs from Live Word Cloud

| | Word Cloud | Pin Board |
| --- | --- | --- |
| What people send | 1–3 words | A short note (up to 280 characters) |
| What the screen shows | Words sized by frequency | Every note as its own card |
| Participants see the result | No, only their own words | Yes, the live board on their phone (unless hidden) |
| Participants can edit | No | Yes, their own notes while the board is open |
| Interaction | — | Likes on notes |

---

## Features

### Presenter view (`index.html`)
- Create a board with a **question or prompt**, such as *"What is one thing you learned today?"*
- Choose a **layout**:
  - **Wall**: notes flow into a grid, newest first
  - **Columns**: 2–5 named columns, for example *Went well / To improve / Ideas*. Participants pick a column when posting
- Large QR code and join code, with a toggle to hide the QR once everyone has joined
- Live counters for participants and notes
- Sort notes by **newest**, **oldest** or **most liked**
- Click a note to **enlarge** it for discussion
- Controls:
  - **Pause or resume** posting (the board stays visible)
  - **Approval mode**: new notes stay hidden until the presenter approves them
  - **Reveal mode**: participants see only their own notes until the presenter clicks **Reveal**, which avoids copying and groupthink. Until then the projector shows notes face down, so the class can see how many have arrived without reading them
  - **Highlight** a note (pinned to the top with an accent border)
  - **Hide or delete** a note. Hidden notes move to the sidebar panel and can be restored
  - **Clear** the board
  - **Show names** on or off (see [Post rules](#post-rules))
  - **Export** the notes as CSV, and **Print** the board (or save it as PDF) through the browser's print dialog
  - **Fullscreen** mode for projectors
- Day and night theme toggle

### Participant view (`join.html`)
- Mobile-first layout with large tap targets
- Shows the question and an **Add a note** form: text box (280-character limit with a counter), colour picker and, in Columns layout, a column picker
- Optional name field, shown only when the presenter allows names. The name is remembered on that phone
- Lets each person add several notes, with a configurable limit (default 3)
- Shows the **live board** below the form; the person's own notes are marked "You" and can be **edited or deleted** while the board is open
- **Like** other notes with a tap (one like per person per note)
- Friendly messages when the board is paused, waiting for approval, hidden until reveal, or closed
- Follows the phone's light or dark setting automatically

---

## Tech stack

| Concern            | Choice                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Hosting            | GitHub Pages                                                           |
| Real-time backend  | Firebase Realtime Database + Anonymous Auth (modular JS SDK via CDN), shared with Live Word Cloud |
| Board layout       | CSS Grid, no layout library                                            |
| QR code            | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) |
| UI                 | Plain HTML, CSS custom properties and ES modules, with no framework or build step |

All libraries load from CDNs with pinned versions, so the repo stays plain
static files that GitHub Pages can serve directly.

---

## Project structure

```
PinBoard/
├── index.html              # Presenter: create board, QR code, live board, moderation
├── join.html               # Participant: add notes, see the board, like
├── css/
│   └── styles.css          # Layout, note cards, light/dark theme tokens
├── js/
│   ├── firebase-config.js  # Same Firebase project config as Word Cloud
│   ├── db.js               # Firebase init, auth, read/write helpers for /boards
│   ├── present.js          # Presenter logic: board setup, QR, moderation, export
│   ├── join.js             # Participant logic: add/edit/delete notes, likes, limits
│   ├── board.js            # Shared rendering of notes (Wall and Columns), sorting
│   ├── posts.js            # Note validation, trimming, profanity filter, colours
│   ├── theme.js            # Day/night toggle, persisted in localStorage (from Word Cloud)
│   └── ui.js               # Small DOM helpers (toast, storage, URL params) (from Word Cloud)
├── assets/
│   └── favicon.svg
├── database.rules.json     # Combined rules for Word Cloud + Pin Board (see below)
├── .github/workflows/
│   └── pages.yml           # Deploys the site to GitHub Pages on push
├── .nojekyll               # Serve files as-is on GitHub Pages
└── README.md
```

`theme.js` and `ui.js` start as copies of the Word Cloud files so both apps look
and behave the same.

---

## Data model

The Spark plan allows only one Realtime Database per project, so both apps live
in the same database, side by side under different top-level nodes:

```
edutools-7c110-default-rtdb
├── sessions/   ← Live Word Cloud (unchanged)
└── boards/     ← Live Pin Board (new)
```

Pin Board only reads and writes under `boards`, so it never touches Word Cloud's
`sessions` data. Board codes and session codes are separate, so `ABC123` can
exist in both apps without clashing.

```jsonc
{
  "boards": {
    "ABC123": {
      "meta": {
        "title": "What is one thing you learned today?",
        "owner": "<presenter anonymous uid>",
        "layout": "columns",         // "wall" | "columns"
        "columns": {                  // only used in Columns layout
          "c1": { "name": "Went well",  "order": 0 },
          "c2": { "name": "To improve", "order": 1 }
        },
        "open": true,                 // false = posting paused
        "approval": false,            // true = new notes need approval
        "revealed": true,             // false = participants see only their own notes
        "showNames": false,
        "maxPerUser": 3,              // 0 = unlimited
        "createdAt": 1760000000000
      },
      "posts": {
        "-Ob1a...": {
          "text": "Photosynthesis needs light, water and CO2",
          "column": "c1",
          "color": "yellow",          // one of a fixed palette
          "name": "Aisha",            // optional, only if showNames
          "uid": "<participant uid>",
          "ts": 1760000001234,        // server time when created
          "editedAt": 1760000005678,  // optional
          "highlighted": false        // presenter only
        }
      },
      "pending": {                    // notes the class can't see yet
        "-Ob1b...": {
          "text": "Is photosynthesis the opposite of respiration?",
          "color": "blue",
          "uid": "<participant uid>",
          "ts": 1760000002345,
          "hidden": true              // true = hidden by the presenter, absent = awaiting approval
        }
      },
      "likes": {
        "-Ob1a...": { "<uid>": true, "<uid>": true }
      }
    }
  }
}
```

- Each note is its own child, so two people posting at the same moment never overwrite each other.
- Likes are stored per user (`likes/$postId/$uid`) rather than as a counter, so each person can like a note only once and the count can't be faked.
- Notes the class should not see are kept in a separate `pending` node rather than flagged inside `posts`. Database rules cannot filter individual children, so a separate node is the only way to make sure students' phones never download them. Approving or restoring a note moves it to `posts`; hiding a note moves it back to `pending`.

---

## Security rules

The rules live in `database.rules.json`. They enforce:

| Who | Can do |
| --- | --- |
| Anyone | Read `meta` |
| Anyone signed in | Read `posts` and `likes`, but `posts` **only if** the board is revealed |
| A participant | Read **their own** notes in `posts` and `pending` at any time (query by `uid`) |
| A participant | Create a note while `open` is true, tagged with their own `uid` and server timestamp; text 1–280 characters; colour from the palette; column must exist. It goes into `posts`, or into `pending` when approval mode is on |
| A participant | Edit or delete their own note while `open` is true. In approval mode, approved notes can be deleted but not edited, so an edit can't slip past moderation. They cannot change `uid`, `ts`, `highlighted` or `hidden` |
| A participant | Add or remove only their own like (`likes/$postId/<their uid>`), and only on a note in `posts` |
| The presenter (owner) | Everything on their board: edit `meta`, read `pending`, approve, hide, highlight, delete notes, clear the board |

Reveal mode uses Realtime Database's
[query-based rules](https://firebase.google.com/docs/database/security/rules-conditions#query-based_rules):
when a board is not revealed, a participant's read on `posts` is allowed only
if the query is `orderByChild("uid").equalTo(auth.uid)`.

The per-user note limit (`maxPerUser`) is enforced in the participant page, as
in Word Cloud.

> **Important: one rules file for both apps.** Pin Board and Word Cloud share
> one Firebase project, and Firebase has only one set of rules per database.
> Publishing Pin Board's rules on their own would delete Word Cloud's rules
> (and the other way round). `database.rules.json` therefore contains
> **both** the `sessions` block from Word Cloud and the `boards` block, and the
> same file is kept in both project folders. Always publish the combined file.

---

## Setup

Because Pin Board reuses the Firebase project created for Live Word Cloud,
most of the setup is already done. Do **not** create a second database; the
Spark plan allows only one, and Pin Board doesn't need it.

1. **Firebase project and database**: already exist (`edutools-7c110`, Realtime
   Database in `asia-southeast1`). Anonymous sign-in is already enabled.
2. **Config**: `js/firebase-config.js` uses the same values as
   `WordCloud/js/firebase-config.js`.
3. **Rules**: paste the combined `database.rules.json` into
   **Realtime Database → Rules** and click Publish. The same combined file is
   also copied to `WordCloud/database.rules.json`, so publishing from either
   project is always safe.
4. **Run locally**: ES modules do not load from `file://` URLs, so serve the folder over HTTP:

   ```bash
   # any one of these
   npx serve .
   python -m http.server 8080
   ```

   Open <http://localhost:8080>. To test from a phone on the same Wi-Fi, use your
   computer's LAN IP address instead of `localhost`, for example `http://192.168.1.20:8080`.

---

## Deploying to GitHub Pages

1. Push the project to a GitHub repository, for example `PinBoard`.
2. In the repo, open **Settings → Pages** and set *Source* to **GitHub Actions**.
   The included workflow (`.github/workflows/pages.yml`) publishes the site on every push to `main`.
3. The site will be live at `https://<your-username>.github.io/PinBoard/`.
4. In Firebase, **Authentication → Settings → Authorized domains** must include
   `<your-username>.github.io`. If you already added it for Word Cloud, nothing more is needed.

---

## Using the app

**Presenter**
1. Open the site on the computer connected to the projector.
2. Type the question, choose **Wall** or **Columns** (and name the columns), set
   notes per person, and decide whether to use approval mode, reveal mode and names.
3. Click **Start board** and leave the QR code on screen while people join.
4. Watch notes arrive. Click a note to enlarge it, highlight the best ones, hide anything off-topic.
5. In reveal mode, click **Reveal** when everyone has posted.
6. When you are done, use **Export CSV** or **Print**.

**Participants**
1. Scan the QR code, or go to the site and enter the 6-character code.
2. Write a note, choose a colour (and a column), and tap **Pin it**.
3. Read and like classmates' notes; edit or delete your own while the board is open.

Boards persist, so the presenter can refresh or reopen `index.html?b=ABC123` in
the same browser and keep control of the board.

---

## Theming

Theming works exactly as in Live Word Cloud: CSS custom properties, a
`data-theme` attribute on `<html>`, following the OS setting until the ☀️/🌙
toggle overrides it (saved in `localStorage`).

Note colours come from a fixed palette (yellow, pink, blue, green, purple, orange).
Each colour has a light-theme and a dark-theme value, so cards stay readable in
both modes and on a projector. The stored value is the colour *name*, not a hex
code, so a note switches correctly when the theme changes.

---

## Post rules

`js/posts.js` applies these rules before a note is saved:

1. **Trim** surrounding whitespace and collapse runs of blank lines.
2. **Length**: 1–280 characters. Line breaks are allowed.
3. **Plain text only**: notes are text, with no photos, files or formatting. They
   are shown with `textContent`, never as HTML, so no one can inject markup or
   scripts. Web links are shown as plain text.
4. **Profanity filter**: the same small blocklist approach as Word Cloud. Approval
   mode and presenter moderation catch anything the list misses.
5. **Names**: optional, 1–30 characters, shown only when the presenter enables names.
   With names off, notes are anonymous to everyone, including the presenter's screen
   (the anonymous `uid` is never displayed).

---

## Limits and troubleshooting

**Firebase Spark (free) plan limits** are shared between Pin Board and Word Cloud:

| Limit                  | Value       | What it means in practice               |
| ---------------------- | ----------- | --------------------------------------- |
| Simultaneous connections | 100       | About 99 phones plus 1 presenter, across **both** apps at the same moment |
| Storage                | 1 GB        | Hundreds of thousands of notes           |
| Download               | 10 GB/month | Fine for regular class use; each phone downloads the whole board, so a 40-student board costs more than a word cloud |

Unlike Word Cloud, participants stay connected to see the live board, so the
100-connection limit matters more. For larger audiences, upgrade to the
pay-as-you-go **Blaze** plan.

| Problem | Fix |
| ------- | --- |
| Word Cloud stopped working after setting up Pin Board | Rules were published without the `sessions` block. Publish the combined `database.rules.json` |
| `auth/operation-not-allowed` | Enable **Anonymous** sign-in in Firebase Authentication |
| Works locally but not on GitHub Pages | Add `<user>.github.io` to Firebase **Authorized domains** |
| `auth/requests-from-referer-…-are-blocked` | The API key has website restrictions. In Google Cloud Console → **APIs & Services → Credentials**, open the browser API key and add the address under **Website restrictions**, for example `http://localhost:8080/*`, `http://127.0.0.1:8080/*` or your LAN IP. Keep the existing entries. Changes take a few minutes |
| `PERMISSION_DENIED` on post | The board is paused, or the note is empty or longer than 280 characters |
| Participants can't see others' notes | The board is in reveal mode and hasn't been revealed yet, or notes await approval |
| Blank page, module errors in console | You opened the file via `file://`; serve it over HTTP |

---

## Roadmap

- [ ] *(planned)* **Freeform canvas** layout where the presenter drags notes anywhere
- [ ] *(planned)* Clickable links and link previews
- [ ] *(planned)* Comments / replies on a note
- [ ] *(planned)* Board templates (KWL chart, Retro, Exit ticket, Parking lot)
- [ ] Stricter server-side rate limit per user (checked in rules)
- [ ] Optional presenter PIN for reclaiming a board from another device
- [ ] Accessibility pass (keyboard navigation, screen-reader labels for notes and likes)
- [ ] Automatic cleanup of boards older than 30 days

---

## License

MIT
