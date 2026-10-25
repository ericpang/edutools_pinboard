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
- **Random groups**: everyone who joins is placed in a random group, with groups kept the same size
- **Group chat**: with groups on, each group gets a private chat that only its members and the presenter can read
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
      │  /boards/ABC123/{meta, posts, likes, members}   │
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
- Optional **random groups** (2–12), chosen when the board is created. See [Random groups](#random-groups)
- With groups on, an optional **group chat**: switch it on or off, read any group's conversation and delete messages. See [Group chat](#group-chat)
- Live counters for participants and notes
- Sort notes by **newest**, **oldest** or **most liked**
- Resize any note by dragging its bottom-right corner (double-click the corner to reset). In Wall layout, wider notes span more grid columns.
- Resize the board: drag the divider next to the side panel (or double-click it to reset), and use the **Note size** slider to make notes bigger or smaller. **Hide panel** gives the whole width to the board. These choices are remembered in your browser.
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
- When groups are on, shows **"Your group: Group N"** at the top as soon as the person joins
- When group chat is on, a collapsible **Group chat** card under it lets the person talk with the others in their group, and give a 👍 to their messages. A badge counts messages they haven't read
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
│   ├── groups.js           # Random, balanced group assignment
│   ├── chat.js             # Group chat: message rules, member labels, conversation view
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
        "groups": 4,                  // optional: number of random groups, 0 = off
        "groupSeed": 1234567,         // optional: shuffles the order groups are dealt out
        "chat": true,                 // optional: group chat on or off (needs groups)
        "createdAt": 1760000000000
      },
      "posts": {
        "-Ob1a...": {
          "text": "Photosynthesis needs light, water and CO2",
          "column": "c1",
          "color": "yellow",          // one of a fixed palette
          "name": "Aisha",            // optional, only if showNames
          "group": 2,                 // optional, the author's group
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
      },
      "joinCount": 7,                 // how many people have been placed in a group
      "members": {
        "<uid>": { "group": 2, "slot": 6, "ts": 1760000000500 }
      },
      "chat": {                       // group chat: one flat list, each message tagged with its group
        "-Ob1c...": {
          "group": 2,                 // the sender's group; only that group can read the message
          "uid": "<participant uid>",
          "slot": 6,                  // the sender's join slot; shows as "Member 2" in the chat
          "name": "Aisha",            // optional chat name
          "text": "I think it's the second one",
          "ts": 1760000003456,
          "likes": { "<uid>": { "slot": 6, "name": "Aisha" } }  // one thumbs up per groupmate, saying who gave it
        }
      }
    }
  }
}
```

- Each note is its own child, so two people posting at the same moment never overwrite each other.
- Likes are stored per user (`likes/$postId/$uid`) rather than as a counter, so each person can like a note only once and the count can't be faked.
- Notes the class should not see are kept in a separate `pending` node rather than flagged inside `posts`. Database rules cannot filter individual children, so a separate node is the only way to make sure students' phones never download them. Approving or restoring a note moves it to `posts`; hiding a note moves it back to `pending`.
- Chat messages are one list tagged with each sender's group. A phone may read it only as a query on its **own** group (`orderByChild("group").equalTo(<its group>)`), the same technique reveal mode uses for notes, so it can never download another group's conversation. Thumbs ups live inside each message, so they follow the same rule.

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
| A participant | On a board with groups: add exactly 1 to `joinCount`, then write their own `members/<their uid>` once (it can't be changed afterwards). A note's `group` must match their own group |
| A participant | On a board with groups and chat on: post to **their own group's** chat (the message's `group`, `uid` and `slot` must match their own membership; 1–300 characters, optional name up to 30), and read **only their own group's** messages. They can give a thumbs up to a groupmate's message (one per person, never to their own message or another group's; it records who gave it, and the member number must match their own membership). They can't edit or delete messages |
| The presenter (owner) | Everything on their board: edit `meta`, read `pending`, approve, hide, highlight, delete notes, read every group's chat and delete messages, clear the board |

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
> When the `boards` rules change (group chat added the `chat` rules), copy the
> new file into the other project folders too, or publishing from one of them
> would remove the new rules again.

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
1. Scan the QR code, or go to the site and enter the 6-character code. If the board has groups, your group appears at the top.
2. Write a note, choose a colour (and a column), and tap **Pin it**.
3. Read and like classmates' notes; edit or delete your own while the board is open.

Boards persist, so the presenter can refresh or reopen `index.html?b=ABC123` in
the same browser and keep control of the board.

---

## Random groups

Pick a number of groups under **Random groups** when you create a board. Each
person is placed in a group the moment they open the join page:

- **Balanced**: each joiner takes the next number from a shared counter
  (`joinCount`). Numbers are dealt out in rounds, and every round gives each
  group exactly one person, so group sizes never differ by more than one.
- **Random**: the order the groups are dealt in is shuffled again for every
  round, using the board's `groupSeed`, so nobody can predict or choose a group
  by joining at a particular moment.
- **Safe when many people join at once**: the counter is claimed in a
  Firebase transaction, so two phones can never get the same number.
- **Sticky**: reopening the page on the same phone keeps the same group.

The presenter's side panel lists each group with how many people have joined
it and how many notes it has posted. Click a group to show only its notes, and
click it again (or the *Showing Group N only* badge) to show everyone. Notes
carry a coloured group tag, and the CSV export has a `group` column.

Limits to know about:
- The number of groups is set when the board is created and can't be changed later.
- Someone who joins on a second device counts again, so that group grows by one.
- Clearing the board deletes notes and likes but keeps everyone's groups.
- A student who knows how could write their own group number using the browser's
  developer tools. The rules make sure the group exists and can't be changed
  once it has been set, but they can't recompute the shuffle.

### Group chat

When you pick groups, **Group chat** appears under *Options*, ticked by default.
With it on, each group gets its own conversation. On the join page a collapsible
**Group chat** card sits under *Your group*, with a badge counting messages the
person hasn't read yet.

- **Isolated**: every message is tagged with its sender's group, and the
  database rules let a person read and post only in their own group's chat. A
  phone never even downloads another group's conversation.
- **Everyone can be told apart**: every message shows who sent it. Other
  members' messages sit on the left with a coloured avatar and their name; your
  own sit on the right and read *You*. Each person appears as **Member N**, their
  position in the group, which is the same on every phone, or by a **chat name**
  they type in the card, shown as *Aisha #3* so two people can't pass for each
  other. The card tells you how you appear ("You appear as Member 2"). The number
  comes from the person's join slot, and the rules require it to match their real
  membership.
- **Thumbs up**: tap 👍 under a groupmate's message to agree with it, and tap
  again to take it back. Every message shows how many thumbs up it has and who
  gave them (you first, then the others by member number), the same on every phone
  in the group and in the presenter's transcript. You can't thumbs-up your own
  message, but you can see how many it got and from whom.
- **Presenter control**: **💬 Chat** in the side panel switches chat on or off
  at any time (boards made before chat existed start with it off). The 💬 button
  on a group's row in the *Groups* panel opens that group's conversation, where
  you can delete single messages or clear the chat. **Clear** on the board also
  deletes the group chats.
- **Kept friendly**: messages and chat names go through the same word filter as
  notes. As with notes, it's a best-effort filter, so the presenter's controls
  catch the rest.

Limits to know about:
- Messages are text only, 1–300 characters. A phone loads the newest 200 messages
  of its group.
- Only the presenter can delete messages; the person who wrote one can't edit or
  remove it. Deleting a message also removes its thumbs up.
- Thumbs ups are stored per person (`chat/<id>/likes/<uid>`), so each person
  counts once and the total can't be inflated from one phone. Like a message, each
  one records the giver's member number and chat name, and the rules check the
  number against their membership.
- Chat names are shown inside the group's chat (and to the presenter) even when
  **Show names** is off for the board.
- Member numbers come from join slots, which the rules can't check against the
  shuffle. A student using developer tools could claim a groupmate's number, in
  the same way they could choose their own group.
- Chat is not moderated before it appears. If a group gets out of hand, switch
  chat off or clear it from the Groups panel.
- Messages stay in the database until the presenter clears them.
- Firebase remembers the anonymous user per browser, so **two tabs of the same
  browser are the same student**: both get the same group and member number, and
  every message reads *You* on the right. To try chat on one computer, use a
  normal window plus a private window, a second browser, or a phone, one for each
  extra student.

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
6. **Group chat**: messages follow the same trim and word-filter rules, with a limit
   of 1–300 characters. Chat names use the same 1–30 character rule as note names.

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
| Every chat message reads *You* and sits on the right | You're testing with several tabs of one browser, which Firebase treats as one student. Open each extra student in a private window, another browser or a phone |
| No **Group chat** card on the join page | The board has no groups, or chat is off (**💬 Chat** in the side panel). Boards made before chat existed need it switched on once |
| Can't create a board with groups, or `PERMISSION_DENIED` on chat | The published rules are older than the chat feature. Publish the latest `database.rules.json` **before** deploying the site |
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
