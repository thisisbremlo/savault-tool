export function cleanUrl(url) {
    if (!url) return ""
    const trimmed = url.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed
    }
    return `https://${trimmed}`
}

export function slugify(text) {
    return String(text)
        .toLowerCase()
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\.[a-z]{2,}$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
}

export function getSlugFromUrl(url) {
    try {
        const hostname = new URL(url).hostname.replace(/^www\./, "")
        const parts = hostname.split(".")
        if (parts.length >= 2) return slugify(parts[0])
        return slugify(hostname)
    } catch {
        return ""
    }
}

export function cleanTitle(title, fallback) {
    if (!title) return fallback
    return String(title)
        .replace(/\s+/g, " ")
        .replace(/\s[|–—]\s.*$/, "")
        .replace(/\s-\s.*$/, "")
        .trim()
}

export function makeHoverDescription(title, metaDescription, pageSummary) {
    const source = String(metaDescription || pageSummary || "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[^\p{L}\p{N}\s&+-]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()

    const stopWords = new Set([
        "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in",
        "into", "is", "it", "of", "on", "or", "the", "to", "with", "your",
        "you", "we", "our", "this", "that", "all", "new", "best", "online",
        "website", "platform", "software", "solution", "tools", "tool",
        "app", "apps", "home", "page",
    ])

    const words = source
        .split(" ")
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !stopWords.has(word.toLowerCase()))

    const phrase = words.slice(0, 6).join(" ")

    if (phrase && phrase.toLowerCase() !== String(title).toLowerCase()) {
        return phrase
    }
    return ""
}

export function addUtm(url, utmSource, utmMedium) {
    try {
        const parsed = new URL(url)
        parsed.searchParams.set("utm_source", utmSource)
        parsed.searchParams.set("utm_medium", utmMedium)
        return parsed.toString()
    } catch {
        return url
    }
}
