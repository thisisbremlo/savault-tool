import fs from "fs"
import path from "path"
import { chromium } from "playwright"
import { cleanTitle } from "./utils.mjs"

async function hideCookieBanners(page) {
    try {
        await page.evaluate(() => {
            const keywords = [
                "cookie", "cookies", "consent", "privacy", "gdpr",
                "datenschutz", "preferences", "tracking",
            ]
            const elements = Array.from(document.querySelectorAll("body *"))
            for (const element of elements) {
                const text = element.innerText?.toLowerCase?.() || ""
                const id = element.id?.toLowerCase?.() || ""
                const className = String(element.className || "").toLowerCase()
                const style = window.getComputedStyle(element)
                const matchesKeyword = keywords.some(
                    (keyword) =>
                        text.includes(keyword) ||
                        id.includes(keyword) ||
                        className.includes(keyword)
                )
                const isOverlay =
                    style.position === "fixed" ||
                    style.position === "sticky" ||
                    Number(style.zIndex) > 100
                if (matchesKeyword && isOverlay) {
                    element.style.display = "none"
                }
            }
        })
    } catch {
        // ignore
    }
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0
            const distance = 700
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight
                window.scrollBy(0, distance)
                totalHeight += distance
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer)
                    resolve()
                }
            }, 200)
        })
    })
    await page.waitForTimeout(1000)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)
}

async function getWebsiteMeta(page, fallbackTitle) {
    return await page.evaluate((fallbackTitle) => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
        const getMeta = (selector) =>
            clean(document.querySelector(selector)?.getAttribute("content") || "")

        function getFirstUsefulText() {
            const selectors = ["h1", "h2", "main p", "section p", "header p", "article p", "p"]
            const blockedWords = [
                "cookie", "privacy", "terms", "newsletter", "subscribe",
                "sign up", "accept", "login", "menu", "copyright",
                "all rights reserved",
            ]
            for (const selector of selectors) {
                const elements = Array.from(document.querySelectorAll(selector))
                for (const element of elements) {
                    const text = clean(element.innerText)
                    const lower = text.toLowerCase()
                    if (
                        text.length >= 20 &&
                        text.length <= 260 &&
                        !blockedWords.some((word) => lower.includes(word))
                    ) {
                        return text
                    }
                }
            }
            return ""
        }

        function getJsonLdDescription() {
            const scripts = Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
            )
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent || "")
                    const items = Array.isArray(data) ? data : [data]
                    for (const item of items) {
                        if (item?.description) return clean(item.description)
                        if (item?.["@graph"]) {
                            for (const graphItem of item["@graph"]) {
                                if (graphItem?.description) return clean(graphItem.description)
                            }
                        }
                    }
                } catch {
                    // ignore invalid JSON
                }
            }
            return ""
        }

        const siteName =
            getMeta('meta[property="og:site_name"]') ||
            getMeta('meta[name="application-name"]') ||
            getMeta('meta[name="apple-mobile-web-app-title"]')

        const ogTitle = getMeta('meta[property="og:title"]')
        const twitterTitle = getMeta('meta[name="twitter:title"]')
        const documentTitle = clean(document.title)

        const metaDescription =
            getMeta('meta[name="description"]') ||
            getMeta('meta[property="description"]') ||
            getMeta('meta[property="og:description"]') ||
            getMeta('meta[name="twitter:description"]') ||
            getMeta('meta[itemprop="description"]') ||
            getJsonLdDescription()

        const pageSummary = getFirstUsefulText()

        // OG / Twitter image discovery, resolved to absolute URL
        const ogImageRaw =
            getMeta('meta[property="og:image:secure_url"]') ||
            getMeta('meta[property="og:image"]') ||
            getMeta('meta[name="twitter:image"]') ||
            getMeta('meta[name="twitter:image:src"]')

        let ogImage = ""
        if (ogImageRaw) {
            try {
                ogImage = new URL(ogImageRaw, document.baseURI).toString()
            } catch {
                ogImage = ogImageRaw
            }
        }

        return {
            title: siteName || ogTitle || twitterTitle || documentTitle || fallbackTitle,
            metaDescription,
            pageSummary,
            ogImage,
        }
    }, fallbackTitle)
}

function normalizeFontFamily(value) {
    if (!value) return ""
    return value.split(",")[0].replaceAll('"', "").replaceAll("'", "").trim()
}

function rgbToHex(value) {
    if (!value) return null
    const match = String(value).match(
        /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/
    )
    if (!match) return null
    const alpha = match[4] === undefined ? 1 : Number(match[4])
    if (alpha < 0.08) return null
    const r = Math.max(0, Math.min(255, Math.round(Number(match[1]))))
    const g = Math.max(0, Math.min(255, Math.round(Number(match[2]))))
    const b = Math.max(0, Math.min(255, Math.round(Number(match[3]))))
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`
}

function sortObjectByCount(object) {
    return Object.entries(object)
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key)
}

function detectBuilderAndTech(raw) {
    const html = String(raw.html || "").toLowerCase()
    const generator = String(raw.generator || "").toLowerCase()
    const scripts = (raw.scripts || []).join("\n").toLowerCase()
    const source = `${html}\n${generator}\n${scripts}`
    const tech = new Set()
    let builder = "Unknown"

    function has(value) {
        return source.includes(value.toLowerCase())
    }

    if (has("framerusercontent") || has("framerstatic") || has("data-framer")) {
        builder = "Framer"
        tech.add("Framer")
        tech.add("React")
    }
    if (has("webflow.js") || has("webflow")) {
        builder = builder === "Unknown" ? "Webflow" : builder
        tech.add("Webflow")
    }
    if (has("static.squarespace.com") || has("squarespace")) {
        builder = builder === "Unknown" ? "Squarespace" : builder
        tech.add("Squarespace")
    }
    if (has("wixstatic") || has("wix.com")) {
        builder = builder === "Unknown" ? "Wix" : builder
        tech.add("Wix")
    }
    if (has("cdn.shopify.com") || has("myshopify") || has("shopify")) {
        builder = builder === "Unknown" ? "Shopify" : builder
        tech.add("Shopify")
    }
    if (has("wp-content") || has("wp-includes") || generator.includes("wordpress")) {
        builder = builder === "Unknown" ? "WordPress" : builder
        tech.add("WordPress")
    }
    if (has("__next_data__") || has("/_next/")) {
        if (builder === "Unknown") builder = "Custom / Next.js"
        tech.add("Next.js")
        tech.add("React")
    }
    if (has("__nuxt") || has("/_nuxt/")) {
        if (builder === "Unknown") builder = "Custom / Nuxt"
        tech.add("Nuxt")
        tech.add("Vue")
    }
    if (has("astro-island") || has("/_astro/")) {
        if (builder === "Unknown") builder = "Custom / Astro"
        tech.add("Astro")
    }
    if (has("react")) tech.add("React")
    if (has("vue")) tech.add("Vue")
    if (has("svelte")) tech.add("Svelte")
    if (has("vercel")) tech.add("Vercel")

    return { builder, techStack: Array.from(tech).slice(0, 8) }
}

async function analyzeDesign(page) {
    const raw = await page.evaluate(() => {
        const result = {
            fonts: {},
            colors: {},
            html: document.documentElement.outerHTML.slice(0, 600000),
            scripts: Array.from(document.scripts)
                .map((s) => s.src || s.textContent?.slice(0, 400) || "")
                .filter(Boolean),
            generator:
                document.querySelector('meta[name="generator"]')?.getAttribute("content") || "",
        }

        const elements = Array.from(
            document.querySelectorAll(
                "body, header, nav, main, section, article, footer, h1, h2, h3, h4, p, a, button, span, li, input, textarea, label, div"
            )
        ).slice(0, 1200)

        for (const element of elements) {
            const rect = element.getBoundingClientRect()
            if (rect.width < 2 || rect.height < 2) continue
            const style = window.getComputedStyle(element)
            const fontFamily = style.fontFamily
            if (fontFamily) {
                result.fonts[fontFamily] = (result.fonts[fontFamily] || 0) + 1
            }
            const colorValues = [
                style.color, style.backgroundColor, style.borderColor,
                style.outlineColor, style.textDecorationColor,
            ]
            for (const color of colorValues) {
                if (!color) continue
                result.colors[color] = (result.colors[color] || 0) + 1
            }
        }
        return result
    })

    const fontCounts = {}
    for (const [fontFamily, count] of Object.entries(raw.fonts)) {
        const normalized = normalizeFontFamily(fontFamily)
        if (!normalized) continue
        const blockedFonts = [
            "serif", "sans-serif", "monospace", "system-ui",
            "-apple-system", "blinkmacsystemfont",
        ]
        if (blockedFonts.includes(normalized.toLowerCase())) continue
        fontCounts[normalized] = (fontCounts[normalized] || 0) + count
    }
    const fonts = sortObjectByCount(fontCounts).slice(0, 8)

    const colorCounts = {}
    for (const [color, count] of Object.entries(raw.colors)) {
        const hex = rgbToHex(color)
        if (!hex) continue
        colorCounts[hex] = (colorCounts[hex] || 0) + count
    }
    const colorPalette = sortObjectByCount(colorCounts).slice(0, 8)

    const detection = detectBuilderAndTech(raw)
    return { fonts, colorPalette, builder: detection.builder, techStack: detection.techStack }
}

async function downloadOgImage(page, ogImageUrl, destPath) {
    if (!ogImageUrl) return false
    try {
        const response = await page.request.get(ogImageUrl, { timeout: 15000 })
        if (!response.ok()) return false
        const buffer = await response.body()
        fs.writeFileSync(destPath, buffer)
        return true
    } catch {
        return false
    }
}

/**
 * Captures thumbnail + fullpage screenshots, downloads the OG image,
 * and extracts meta/design info for a given URL.
 * Writes raw files into workDir (created if needed):
 *   workDir/website-thumbnail.png
 *   workDir/website-fullpage.png
 *   workDir/og-image.<ext>  (if available)
 */
export async function captureSite(url, fallbackTitle, workDir) {
    fs.mkdirSync(workDir, { recursive: true })

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
        deviceScaleFactor: 1,
    })

    const result = {
        title: fallbackTitle,
        metaDescription: "",
        pageSummary: "",
        hoverDescription: "",
        analysis: { fonts: [], colorPalette: [], builder: "Unknown", techStack: [] },
        ogImageDownloaded: false,
        ogImagePath: null,
        error: null,
    }

    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
        try {
            await page.waitForLoadState("networkidle", { timeout: 15000 })
        } catch {
            // some sites never go idle
        }
        await page.waitForTimeout(2000)
        await hideCookieBanners(page)

        const meta = await getWebsiteMeta(page, fallbackTitle)
        const analysis = await analyzeDesign(page)

        result.title = cleanTitle(meta.title, fallbackTitle)
        result.metaDescription = meta.metaDescription
        result.pageSummary = meta.pageSummary
        result.analysis = analysis

        // Thumbnail (above the fold)
        await page.screenshot({
            path: path.join(workDir, "website-thumbnail.png"),
            fullPage: false,
        })

        // Fullpage
        await autoScroll(page)
        await hideCookieBanners(page)
        await page.screenshot({
            path: path.join(workDir, "website-fullpage.png"),
            fullPage: true,
        })

        // OG image
        if (meta.ogImage) {
            const ext = (meta.ogImage.split("?")[0].split(".").pop() || "png").slice(0, 4)
            const ogDest = path.join(workDir, `og-image.${ext}`)
            const ok = await downloadOgImage(page, meta.ogImage, ogDest)
            if (ok) {
                result.ogImageDownloaded = true
                result.ogImagePath = ogDest
            }
        }
    } catch (error) {
        result.error = error.message
    } finally {
        await page.close()
        await browser.close()
    }

    return result
}
