# Neobjuk 4-Cut Intro Wall — Setup Guide

A responsive web app (phone + computer) where students add a photo + short intro, arranged as a **4-cut photobooth frame per team** (3 members + 1 organizer cut), split into **Batch 1 / Batch 2** tabs. Everyone sees each other.

Open `index.html` right now to see it in **Preview mode** (sample data). To make it live and shared, do the steps below (~15 min).

---

## Step 0 — Add your frame image + line up the cells

1. Save your 4-cut frame picture into this folder, named exactly **`frame.png`**.
2. Open `index.html?calibrate=1` in a browser — the 4 photo cells show as **red boxes** so you can see where photos will land.
3. If a box doesn't sit on a white cell, tweak these values at the top of the `<style>` block in `index.html`, then refresh:

```css
--cell-left:20%; --cell-width:60%; --cell-h:19.3%;
--c1-top:6.2%; --c2-top:26.6%; --c3-top:47.0%; --c4-top:67.4%;
```

`--cell-left / --cell-width` move all 4 boxes left/right and set their width; `--c1-top…--c4-top` move each box up/down. (Just send me the frame and I can set these for you.)

---

## Step 1 — Create a free Supabase project

1. Go to **supabase.com** → sign in (GitHub works) → **New project**.
2. Give it a name + database password → create (takes ~2 min).

## Step 2 — Make the table + photo storage

Open **SQL Editor** in Supabase, paste this, and click **Run**:

```sql
-- table for all submissions
create table members (
  id uuid primary key default gen_random_uuid(),
  batch int not null,
  team text not null,
  name text,
  intro text,
  role text default 'member',      -- 'member' or 'team' (4th cut)
  photo_url text,
  created_at timestamptz default now()
);

alter table members enable row level security;
create policy "public read"   on members for select using (true);
create policy "public insert" on members for insert with check (true);
```

Then create the photo bucket:

1. Left menu → **Storage** → **New bucket** → name it exactly **`photos`** → turn ON **Public bucket** → save.
2. Back in **SQL Editor**, run this so students can upload:

```sql
create policy "upload photos" on storage.objects
  for insert to anon with check (bucket_id = 'photos');
create policy "read photos" on storage.objects
  for select to anon using (bucket_id = 'photos');
```

## Step 3 — Paste your keys into the code

1. Supabase → **Settings → API**. Copy **Project URL** and the **anon public** key.
2. Open `index.html`, find the CONFIG block near the bottom, and replace:

```js
const SUPABASE_URL = "https://xxxx.supabase.co";      // your Project URL
const SUPABASE_ANON_KEY = "eyJhbGciOi...";            // your anon public key
```

Save. Open `index.html` again — the yellow "Preview mode" banner disappears and it's live. 🎉

---

## Put it online (so students can open the link)

**Easiest — Netlify Drop:** go to **app.netlify.com/drop** and drag the `neobjuk-intro-wall` folder in. You get a public link instantly.

**Or Vercel (same as class):** push the folder to a GitHub repo → **vercel.com → New Project → Import** → Deploy. (See the class *Guide 4 — Deploy* in Notion.)

Share the final link + a QR code with both batches.

---

## Good to know

- **How students use it:** open the link → **＋ Add me** → pick Batch + Team, type name + intro, choose a photo → Post. Photos are auto-shrunk before upload, so phone photos are fine.
- **The 4th cut (organizer photo):** in the form choose **Role → "Team photo (4th cut)"** and upload the shared/team picture. Leave it blank and it shows a 📸 placeholder.
- **Teams:** the frame holds 3 member photos + 1 organizer cut. Extra members still show their intro on the side.
- **Moderation / delete a post:** Supabase → **Table Editor → members** → delete the row (and optionally its file in Storage).
- **Note on access:** anyone with the link can post (no login). Fine for a class of ~80 over a few days — just keep the link within your groups, and delete anything odd from the Table Editor.
- **Free limits:** Supabase free tier (500MB DB + 1GB storage) easily covers 80 resized photos.
