/**
 * Triggers a refresh of the savault-archive-worker (the Cloudflare Worker
 * between Notion and the Chrome extension) after new content is published.
 *
 * The worker mirrors the Notion database into Workers KV and normally
 * refreshes on a cron schedule. Calling its `POST /api/refresh` endpoint
 * right after we push to Notion / GitHub makes new entries show up in the
 * extension immediately instead of waiting for the next cron tick.
 *
 * Configure via .env:
 *   SAVAULT_WORKER_URL  e.g. https://savault-archive-worker.<subdomain>.workers.dev
 *   SAVAULT_API_KEY     same value as the worker's SAVAULT_API_KEY secret
 *
 * All failures are non-fatal: publishing works whether or not the worker
 * is configured; the info is returned so the UI can show what happened.
 */

const DEFAULT_TIMEOUT_MS = 20000

function normalizeBaseUrl(url) {
    return String(url || "").trim().replace(/\/+$/, "")
}

export function workerRefreshConfigured(env = process.env) {
    return Boolean(normalizeBaseUrl(env.SAVAULT_WORKER_URL) && String(env.SAVAULT_API_KEY || "").trim())
}

export async function triggerWorkerRefresh(env = process.env, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const baseUrl = normalizeBaseUrl(env.SAVAULT_WORKER_URL)
    const apiKey = String(env.SAVAULT_API_KEY || "").trim()

    if (!baseUrl || !apiKey) {
        return {
            attempted: false,
            ok: false,
            reason: "SAVAULT_WORKER_URL and/or SAVAULT_API_KEY not set in .env",
        }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(`${baseUrl}/api/refresh`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Savault-Key": apiKey,
            },
            signal: controller.signal,
        })

        let payload = null
        try { payload = await res.json() } catch {}

        if (!res.ok) {
            return {
                attempted: true,
                ok: false,
                reason: payload?.error || `Worker responded ${res.status}`,
            }
        }

        return {
            attempted: true,
            ok: true,
            itemCount: typeof payload?.items === "number" ? payload.items : null,
            updatedAt: payload?.updatedAt || null,
        }
    } catch (error) {
        return {
            attempted: true,
            ok: false,
            reason:
                error?.name === "AbortError"
                    ? `Timed out after ${timeoutMs} ms (refresh may still complete on the worker)`
                    : error?.message || "Unknown network error",
        }
    } finally {
        clearTimeout(timer)
    }
}
