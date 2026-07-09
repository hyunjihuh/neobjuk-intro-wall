# HANDOFF — KAIST × UITS 4-Cut Intro Wall

Pass this whole folder to Claude Code / your editor to continue. Everything below is current status + what's left.

## What it is
A responsive (phone + computer) self-introduction "photo wall" for ~80 Bangladeshi students, split into **Batch 1 / Batch 2** tabs. Each **team of 3** gets a **4-cut photobooth filmstrip frame**: 3 cuts = member photos, 4th cut = organizer/team photo. Member **name + short intro** show next to the frame. Everyone can see everyone.

## Stack
- Single **`index.html`**, vanilla JS, no framework.
- **Supabase** for shared storage: Postgres table + Storage bucket for photos.
- Static hosting (Netlify Drop or Vercel).
- Frame is an image asset **`frame.png`** with 4 photo cells absolutely positioned over it via CSS variables.

## Data model  (SQL is in SETUP.md)
`members` table: `id, batch int, team text, name text, intro text, role text ('member'|'team'), photo_url text, created_at`.
Storage bucket **`photos`** (public). Photos are client-side resized to max 900px, JPEG 0.85, then uploaded.

Render pipeline: `load()` → fetch rows → `render()` groups by batch then team → `frameHTML()` builds one frame (3 member cells + 1 org cell) → intros listed beside it. In preview mode (no keys) it uses the `SAMPLE` array.

## Config (top of the `<script>` in index.html)
```js
const SUPABASE_URL = "YOUR_SUPABASE_URL";       // Supabase → Settings → API → Project URL
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"; // anon PUBLIC key (safe in client)
const FRAME_SRC = "frame.png";
```

## DONE
- Responsive layout, Batch 1/2 tabs, add-form modal, photo resize+upload, Supabase read/write, preview mode with sample data.
- Frame overlay system + **calibrate mode**: open `index.html?calibrate=1` to see the 4 cells as red boxes; adjust these CSS vars until they sit on the white cells:
  `--cell-left --cell-width --cell-h --c1-top --c2-top --c3-top --c4-top`.

## TODO
1. **Add `frame.png`** to this folder (the KAIST×UITS filmstrip image) and calibrate the 4 cell positions.
2. **Paste Supabase URL + anon key** and run the SQL in SETUP.md (table + bucket + policies).
3. **Deploy** (Netlify Drop / Vercel) and share the link + QR with both batches.

## SECURITY (important)
- The **anon key is meant to be public** — it's fine in the deployed client. Safety comes from **RLS policies**, not hiding the key.
- **Never** put the `service_role` (secret) key in the client.
- Current policies allow open insert/select → an outsider with the link could post junk (can't delete others' data or touch your account). Mitigations, in order:
  1. Share link only within your groups (WhatsApp/QR).
  2. **Add a class-code gate** (ask a shared passphrase before posting). ← recommended, not built yet.
  3. After the intro period, drop the insert policy → read-only.
- Moderate by deleting rows/photos in the Supabase Table Editor.

## UX / "make it more intuitive" — suggested next improvements
- **Guide the add-flow**: after picking a team, show that team's frame with the empty cut highlighted ("you'll fill cut #2"), so it's obvious what a submission does.
- **Per-team "＋ add me" button** on each frame (not just one global FAB), so students add to the right team without typing the team name.
- **Prefill/lock team** via URL (e.g. `?team=Team3`) so mentors can hand each team a direct link → removes the biggest source of typos.
- **Clearer empty state / first-run**: a one-line "how it works" strip + an example card.
- **Bigger tap targets & sticky tabs** on mobile; show the add button label in Bengali/English.
- **Confirmation + edit/delete own post** (needs a simple owner token or Supabase auth).
- **Image cropping** to a square before upload (photos currently object-fit cover, which can crop faces oddly).
- Optional: light/dark, loading skeletons, "X people joined" counter.

## Files
- `index.html` — the app
- `frame.png` — YOUR frame image (add this)
- `SETUP.md` — Supabase + deploy steps (+ Step 0 frame/calibrate)
- `HANDOFF.md` — this file
