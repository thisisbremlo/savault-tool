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

1. **Capture** — paste a URL. The tool opens it headlessly, takes a
   thumbnail + fullpage screenshot, downloads the OG image if one exists,
   and pulls meta info (title, description, fonts, colors, builder/tech
   detection).
2. **Review & edit** — check the three previews. If a screenshot got
   messed up by a cookie banner or anything else, use "Replace" on that
   specific image to upload your own file instead. Edit title / slug /
   hover description / meta description as needed.
3. **Save** — optimizes all images with Sharp (WebP, resized) and copies
   them into `savault-assets/screenshots/{thumbnails,fullpages,og}/`.
   Builds the jsDelivr CDN URLs and the full Notion field set.
4. **Notion fields** — each field has its own "Copy" button, or use
   "Copy all as block" for the old clipboard-paste behavior. Then push the
   new assets to GitHub with one click (runs `git add/commit/push` in the
   asset repo for you).

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
