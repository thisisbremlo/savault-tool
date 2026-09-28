import "dotenv/config"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import express from "express"
import multer from "multer"
import sharp from "sharp"

import { captureSite } from "./capture.mjs"
import { optimizeAndCopy } from "./optimize.mjs"
import { checkAssetRepo, pushAssets } from "./git.mjs"
import { buildNotionFields } from "./notion.mjs"
import { getDatabaseSchema, mapFieldsToProperties, createNotionPage, getSelectOptions } from "./notion-api.mjs"
import { purgeJsdelivrUrls } from "./purge.mjs"
import { cleanUrl, getSlugFromUrl, slugify, makeHoverDescription, addUtm } from "./utils.mjs"
import { triggerWorkerRefresh } from "./worker-refresh.mjs"


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, "..")

const PORT = process.env.PORT || 3000

const GITHUB_USER = process.env.GITHUB_USER || "thisisbremlo"
const GITHUB_REPO = process.env.GITHUB_REPO || "savault-assets"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main"

const UTM_SOURCE = process.env.UTM_SOURCE || "savault.de"
const UTM_MEDIUM = process.env.UTM_MEDIUM || "referral"

const NOTION_TOKEN = process.env.NOTION_TOKEN || ""
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || ""

const ASSET_REPO_DIR = path.resolve(
    PROJECT_ROOT,
    process.env.ASSET_REPO_DIR || "../savault-assets"
)

const WORK_DIR = path.join(PROJECT_ROOT, ".work") // scratch space per session
const THUMBNAIL_ASSET_DIR = path.join(ASSET_REPO_DIR, "screenshots", "thumbnails")
const FULLPAGE_ASSET_DIR = path.join(ASSET_REPO_DIR, "screenshots", "fullpages")
const OGIMAGE_ASSET_DIR = path.join(ASSET_REPO_DIR, "screenshots", "og-image")

const CDN_BASE = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}/screenshots`

fs.mkdirSync(WORK_DIR, { recursive: true })

// In-memory session store. Fine for a single-user local tool;
// sessions are cleared when the server restarts.
const sessions = new Map()

// In-memory capture jobs so the UI can poll live progress while Playwright
// is working (a capture takes 15–30s, previously a single opaque spinner).
const captureJobs = new Map()

const app = express()
app.use(express.json({ limit: "2mb" }))
app.use("/work", express.static(WORK_DIR)) // serve raw previews
app.use("/assets-preview", express.static(path.join(ASSET_REPO_DIR, "screenshots")))
app.use(express.static(path.join(PROJECT_ROOT, "public")))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

function newSessionId() {
    return crypto.randomBytes(8).toString("hex")
}

function friendlyCaptureError(message) {
    if (/executable doesn'?t exist|playwright|browserType\.launch/i.test(message)) {
        return "Playwright browser is not installed. Run `npm run install:browsers` first."
    }
    if (/net::ERR|ENOTFOUND|getaddrinfo/i.test(message)) {
        return `Could not reach that URL (${message}).`
    }
    if (/Timeout/i.test(message)) {
        return `The page took too long to load (${message}).`
    }
    return message
}

// --- GET /api/config -------------------------------------------------------
// Environment/asset-repo status so the UI can show connection chips and
// disable actions that cannot work (e.g. Notion push without a token).
app.get("/api/config", (req, res) => {
    const repoCheck = checkAssetRepo(ASSET_REPO_DIR)
    res.json({
        notionConfigured: Boolean(NOTION_TOKEN && NOTION_DATABASE_ID),
        assetRepoOk: repoCheck.ok,
        assetRepoMessage: repoCheck.ok ? null : repoCheck.message,
        github: `${GITHUB_USER}/${GITHUB_REPO}`,
        cdnBase: CDN_BASE,
    })
})

// --- POST /api/capture --------------------------------------------------
// Starts a capture job and returns a jobId immediately. Poll
// GET /api/capture/:jobId for live stage progress and the final result.
app.post("/api/capture", (req, res) => {
    try {
        const rawUrl = req.body?.url
        const url = cleanUrl(rawUrl)
        if (!url) return res.status(400).json({ error: "No URL provided." })

        const fallbackSlug = getSlugFromUrl(url)
        if (!fallbackSlug) return res.status(400).json({ error: "Could not derive a slug from the URL." })

        const sessionId = newSessionId()
        const jobId = newSessionId()
        const workDir = path.join(WORK_DIR, sessionId)

        const job = {
            id: jobId,
            sessionId,
            url,
            fallbackSlug,
            workDir,
            status: "running",
            stage: "browser",
            message: "Launching headless browser…",
            history: [],
            startedAt: Date.now(),
            result: null,
            error: null,
        }
        captureJobs.set(jobId, job)
        if (captureJobs.size > 30) {
            // drop the oldest finished jobs to keep memory flat
            for (const [key, value] of captureJobs) {
                if (captureJobs.size <= 30) break
                if (value.status !== "running") captureJobs.delete(key)
            }
        }

        runCaptureJob(job)

        res.json({ jobId, url })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

async function runCaptureJob(job) {
    try {
        const result = await captureSite(job.url, job.fallbackSlug, job.workDir, (stage, message) => {
            job.stage = stage
            job.message = message
            job.history.push({ stage, message })
        })

        const suggestedSlug = slugify(job.fallbackSlug)
        const metaDescription = result.metaDescription || result.pageSummary || ""
        const hoverDescription = makeHoverDescription(result.title, result.metaDescription, result.pageSummary)

        sessions.set(job.sessionId, {
            url: job.url,
            workDir: job.workDir,
            title: result.title,
            slug: suggestedSlug,
            analysis: result.analysis,
            ogImageDownloaded: result.ogImageDownloaded,
            ogImagePath: result.ogImagePath,
        })

        job.status = "done"
        job.result = {
            sessionId: job.sessionId,
            url: job.url,
            title: result.title,
            slug: suggestedSlug,
            metaDescription,
            hoverDescription,
            analysis: result.analysis,
            error: result.error,
            previews: {
                thumbnail: `/work/${job.sessionId}/website-thumbnail.png`,
                fullpage: `/work/${job.sessionId}/website-fullpage.png`,
                og: result.ogImageDownloaded
                    ? `/work/${job.sessionId}/${path.basename(result.ogImagePath)}`
                    : null,
            },
        }
    } catch (error) {
        job.status = "error"
        job.error = friendlyCaptureError(error.message)
    } finally {
        setTimeout(() => captureJobs.delete(job.id), 10 * 60 * 1000)
    }
}

// --- GET /api/capture/:jobId ------------------------------------------------
// Poll endpoint: returns live progress; includes `result` once status=done.
app.get("/api/capture/:jobId", (req, res) => {
    const job = captureJobs.get(req.params.jobId)
    if (!job) return res.status(404).json({ error: "Unknown capture job — the server may have restarted." })

    const { id, status, stage, message, history, error } = job
    res.json({
        id,
        status,
        stage,
        message,
        history,
        error,
        result: status === "done" ? job.result : null,
    })
})

// --- POST /api/replace ---------------------------------------------------
// Replaces one of the raw preview images (thumbnail / fullpage / og) with
// a manually uploaded file, e.g. to fix a screenshot broken by a cookie banner.
app.post("/api/replace", upload.single("file"), (req, res) => {
    try {
        const { sessionId, type } = req.body
        const session = sessions.get(sessionId)
        if (!session) return res.status(404).json({ error: "Unknown session." })
        if (!["thumbnail", "fullpage", "og"].includes(type)) {
            return res.status(400).json({ error: "Invalid type. Use thumbnail, fullpage, or og." })
        }
        if (!req.file) return res.status(400).json({ error: "No file uploaded." })

        let destName
        if (type === "thumbnail") destName = "website-thumbnail.png"
        else if (type === "fullpage") destName = "website-fullpage.png"
        else {
            const ext = (req.file.originalname.split(".").pop() || "png").slice(0, 4)
            destName = `og-image.${ext}`
            session.ogImageDownloaded = true
            session.ogImagePath = path.join(session.workDir, destName)
        }

        fs.writeFileSync(path.join(session.workDir, destName), req.file.buffer)

        res.json({
            ok: true,
            previewUrl: `/work/${sessionId}/${destName}?t=${Date.now()}`,
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- POST /api/save -------------------------------------------------------
// Optimizes images, copies into the asset repo, builds CDN links + Notion fields.
app.post("/api/save", async (req, res) => {
    try {
        const {
            sessionId,
            title,
            slug: slugInput,
            hoverDescription,
            metaDescription,
            category,
            subcategory,
            pricingType,
            isNew,
            isSponsored,
        } = req.body

        const session = sessions.get(sessionId)
        if (!session) return res.status(404).json({ error: "Unknown session." })

        const repoCheck = checkAssetRepo(ASSET_REPO_DIR)
        if (!repoCheck.ok) return res.status(400).json({ error: repoCheck.message })

        const slug = slugify(slugInput || session.slug)
        if (!slug) return res.status(400).json({ error: "Slug is empty." })

        let ogImageExt = null
        if (session.ogImageDownloaded && session.ogImagePath) {
            ogImageExt = path.basename(session.ogImagePath).split(".").pop()
        }

        const optimized = await optimizeAndCopy({
            workDir: session.workDir,
            slug,
            thumbnailDir: THUMBNAIL_ASSET_DIR,
            fullpageDir: FULLPAGE_ASSET_DIR,
            ogImageDir: OGIMAGE_ASSET_DIR,
            hasOgImage: session.ogImageDownloaded,
            ogImageExt,
        })

        const thumbnailUrl = `${CDN_BASE}/thumbnails/${optimized.thumbFile}`
        const fullpageUrl = `${CDN_BASE}/fullpages/${optimized.fullFile}`
        const ogImageUrl = optimized.ogFile ? `${CDN_BASE}/og-image/${optimized.ogFile}` : ""
        const externalLink = addUtm(session.url, UTM_SOURCE, UTM_MEDIUM)
        const addedDate = new Date().toISOString().slice(0, 10)

        const fields = buildNotionFields({
            title: title || session.title,
            slug,
            hoverDescription: hoverDescription || "",
            metaDescription: metaDescription || "",
            thumbnailUrl,
            fullpageUrl,
            ogImageUrl,
            externalLink,
            category,
            subcategory,
            pricingType,
            isNew,
            isSponsored,
            analysis: session.analysis,
            addedDate,
        })

        session.slug = slug // remember final slug for the push step

        res.json({ ok: true, slug, fields })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- POST /api/push --------------------------------------------------------
app.post("/api/push", (req, res) => {
    try {
        const { sessionId } = req.body
        const session = sessions.get(sessionId)
        if (!session) return res.status(404).json({ error: "Unknown session." })

        const result = pushAssets(ASSET_REPO_DIR, `add ${session.slug} assets`)

        // Fresh CDN URLs only go live after the GitHub commit lands, so
        // also nudge the archive worker to re-read Notion right away.
        const workerRefresh = triggerWorkerRefresh()

        res.json({ ...result, workerRefresh })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- GET /api/notion/options ------------------------------------------------
app.get("/api/notion/options", async (req, res) => {
    try {
        if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
            return res.status(400).json({ error: "NOTION_TOKEN and/or NOTION_DATABASE_ID missing in .env." })
        }
        const schema = await getDatabaseSchema(NOTION_TOKEN, NOTION_DATABASE_ID)
        res.json({
            category: getSelectOptions(schema, "category"),
            subcategory: getSelectOptions(schema, "subcategory"),
        })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- POST /api/notion/push -------------------------------------------------
app.post("/api/notion/push", async (req, res) => {
    try {
        if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
            return res.status(400).json({
                error: "NOTION_TOKEN and/or NOTION_DATABASE_ID missing in .env.",
            })
        }

        const { fields } = req.body
        if (!Array.isArray(fields) || fields.length === 0) {
            return res.status(400).json({ error: "No fields provided." })
        }

        const schema = await getDatabaseSchema(NOTION_TOKEN, NOTION_DATABASE_ID)
        const { properties, unmatched } = mapFieldsToProperties(fields, schema)
        const page = await createNotionPage(NOTION_TOKEN, NOTION_DATABASE_ID, properties)

        // New Notion entry exists now — refresh the archive worker so the
        // extension sees it without waiting for the worker's cron tick.
        const workerRefresh = await triggerWorkerRefresh()

        res.json({ ok: true, pageUrl: page.url, unmatched, workerRefresh })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- GET /api/assets/list ---------------------------------------------------
// Lists existing slugs (derived from thumbnail filenames) so the "fix
// existing entry" panel can offer a dropdown instead of manual typing.
app.get("/api/assets/list", (req, res) => {
    try {
        const repoCheck = checkAssetRepo(ASSET_REPO_DIR)
        if (!repoCheck.ok) return res.status(400).json({ error: repoCheck.message })

        if (!fs.existsSync(THUMBNAIL_ASSET_DIR)) return res.json({ slugs: [] })

        const slugs = fs
            .readdirSync(THUMBNAIL_ASSET_DIR)
            .filter((f) => f.endsWith("-thumbnail.webp"))
            .map((f) => f.replace(/-thumbnail\.webp$/, ""))
            .sort()

        res.json({ slugs })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- POST /api/fix/replace --------------------------------------------------
// Replaces the thumbnail or fullpage image for an existing entry in place,
// keeping the exact same filename (so the CDN URL never changes).
app.post("/api/fix/replace", upload.single("file"), async (req, res) => {
    try {
        const { slug, type } = req.body
        if (!slug) return res.status(400).json({ error: "No slug provided." })
        if (!["thumbnail", "fullpage"].includes(type)) {
            return res.status(400).json({ error: "Invalid type. Use thumbnail or fullpage." })
        }
        if (!req.file) return res.status(400).json({ error: "No file uploaded." })

        const targetDir = type === "thumbnail" ? THUMBNAIL_ASSET_DIR : FULLPAGE_ASSET_DIR
        const targetFile = path.join(targetDir, `${slug}-${type}.webp`)

        if (type === "thumbnail") {
            await sharp(req.file.buffer, { limitInputPixels: false })
                .resize({ width: 1200, withoutEnlargement: true })
                .webp({ quality: 78 })
                .toFile(targetFile)
        } else {
            await sharp(req.file.buffer, { limitInputPixels: false })
                .resize({ width: 1600, height: 12000, fit: "inside", withoutEnlargement: true })
                .webp({ quality: 78 })
                .toFile(targetFile)
        }

        res.json({ ok: true, previewUrl: `/assets-preview/${type === "thumbnail" ? "thumbnails" : "fullpages"}/${slug}-${type}.webp?t=${Date.now()}` })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// --- POST /api/fix/push ------------------------------------------------------
// Commits + pushes the fixed assets, then purges the jsDelivr cache for
// exactly the thumbnail/fullpage URLs of this slug.
app.post("/api/fix/push", async (req, res) => {
    try {
        const { slug } = req.body
        if (!slug) return res.status(400).json({ error: "No slug provided." })

        const pushResult = pushAssets(ASSET_REPO_DIR, `fix ${slug} screenshots`)

        const urls = [
            `${CDN_BASE}/thumbnails/${slug}-thumbnail.webp`,
            `${CDN_BASE}/fullpages/${slug}-fullpage.webp`,
        ]
        const purgeResults = await purgeJsdelivrUrls(urls)

        // Screenshots changed on the CDN — nudge the archive worker too.
        const workerRefresh = triggerWorkerRefresh()

        res.json({ ...pushResult, purge: purgeResults, workerRefresh })
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

app.listen(PORT, () => {
    console.log(`Savault content tool running at http://localhost:${PORT}`)
    console.log(`Asset repo: ${ASSET_REPO_DIR}`)
})
