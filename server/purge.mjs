/**
 * Purges one or more jsDelivr CDN URLs by hitting the equivalent
 * purge.jsdelivr.net endpoint (same path, different host).
 */
export async function purgeJsdelivrUrls(urls) {
    const results = []
    for (const url of urls) {
        const purgeUrl = url.replace("cdn.jsdelivr.net", "purge.jsdelivr.net")
        try {
            const res = await fetch(purgeUrl)
            let data = {}
            try {
                data = await res.json()
            } catch {
                // purge endpoint doesn't always return JSON
            }
            results.push({ url, ok: res.ok, data })
        } catch (error) {
            results.push({ url, ok: false, error: error.message })
        }
    }
    return results
}
