# Savault Content Tool

Local web app that replaces the old `loopa-screenshot-tool` CLI script.
Runs on `localhost`, backed by Playwright (screenshots + OG image download),
Sharp (optimization), and Git (push to `savault-assets`).

## Setup

```bash
npm install
npm run install:browsers   # downloads the Chromium binary for Playwright
cp .env.example .env
```

Edit `.env` and set `ASSET_REPO_DIR` to the local path of your cloned
`savault-assets` repo (relative to this project folder, or an absolute path).

```bash
npm start
```

Open http://localhost:3000

## Workflow

1. **Capture** — paste a URL anywhere on the page (`⌘V`) or press `/` to
   focus the input. The tool opens the site headlessly while a live
   progress timeline shows each step (opening, analyzing, thumbnail,
   fullpage, OG download), then takes a thumbnail + fullpage screenshot,
   downloads the OG image if one exists, and pulls meta info (title,
   description, fonts, colors, builder/tech detection).
2. **Review & edit** — check the three previews (hover → View for the
   full-resolution lightbox, Replace to swap in your own file). The
   captured design analysis is shown as clickable color swatches (copies
   the hex) plus font / builder / tech chips. Edit the fields — the slug
   warns you live if it already exists in the asset repo (it would
   overwrite those CDN files) and hover/meta inputs show length counters.
3. **Save** — optimizes all images with Sharp (WebP, resized) and copies
   them into `savault-assets/screenshots/{thumbnails,fullpages,og}/`.
   Builds the jsDelivr CDN URLs and the full Notion field set.
4. **Notion & publish** — the fields are grouped (Content / Links &
   Assets / Design), each with its own "Copy" button, or "Copy all
   fields". "Add to Notion" creates the row and links you straight to
   the new page; "Push assets to GitHub" runs `git add/commit/push` in
   the asset repo for you.
5. **Fix entry** — filter the dropdown of existing slugs, replace the
   thumbnail/fullpage under the exact same CDN URL, then push & purge
   the jsDelivr cache in one click.

The stepper at the top is clickable (steps unlock as they become
available), and the header shows connection status chips for Notion and
the asset repo. Dark mode follows your system setting — toggle it in the
header.

## Notion integration

Once `.env` has `NOTION_TOKEN` and `NOTION_DATABASE_ID` set, step 3 gets
an "Add to Notion" button next to "Push assets to GitHub". Clicking it:

1. Fetches your database's property schema from Notion.
2. Matches each generated field (Title, Slug, Category, ...) to the
   Notion property with the closest matching name — handles small naming
   differences (e.g. "Hover description" vs "Hover Description") and
   picks the right value shape per property type (title, rich text, url,
   select, multi-select, checkbox, date, number).
3. Creates a new page (row) in your database via the Notion API.

If a field has no matching property in your database, it's just skipped
and listed in the status message — nothing fails silently.

**Setup:**
1. Create an integration at https://www.notion.so/my-integrations, copy
   the token into `NOTION_TOKEN`.
2. Open your database in Notion → "..." (top right) → Connections → add
   your integration. Without this step you'll get a 403.
3. Copy the database ID from its URL (the 32-character segment before
   `?v=`) into `NOTION_DATABASE_ID`.

## Notes / what's still manual

- Sessions are in-memory and per-server-run — if you restart the server
  mid-review, start the capture again for that entry.
- `.work/` holds temporary raw screenshots per session; safe to delete
  anytime the server isn't using it.
- If the Playwright browser download is blocked on your network, set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE` in `.env` to a locally installed
  Chromium binary and the capture will use it instead.
