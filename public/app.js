"use strict"

/* ============================================================
   Savault Content Tool — client logic
   ============================================================ */

const $ = (id) => document.getElementById(id)

const state = {
  mode: "capture",          // "capture" | "fix"
  sessionId: null,
  capturedUrl: "",
  lastFields: [],
  notionConfigured: null,   // null = unknown yet
  cdnBase: "",
  allSlugs: null,           // null = not loaded / unavailable
  currentFixSlug: null,
  maxStep: 1,
}

/* ---------------- Theme ---------------- */

const themeToggle = $("theme-toggle")

function setTheme(theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem("savault-theme", theme) } catch {}
}

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")
})

/* ---------------- URL helpers ---------------- */

function normalizeUrl(raw) {
  let text = (raw || "").trim()
  if (!text) return ""
  // Treat pasted scheme-less domains as https (server does the same).
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return ""
  }
}

/* ---------------- Toasts ---------------- */

const toastsEl = $("toasts")

function toast(message, type = "info", duration = 3500) {
  const el = document.createElement("div")
  el.className = `toast ${type}`
  el.textContent = message
  toastsEl.appendChild(el)
  setTimeout(() => {
    el.classList.add("leaving")
    setTimeout(() => el.remove(), 260)
  }, duration)
}

/* ---------------- Status & log helpers ---------------- */

const SPINNER_SVG =
  '<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>'

const CAPTURE_ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'

function showStatus(element, message, type = "info", loading = false) {
  if (!message) {
    element.innerHTML = ""
    return
  }
  const spinnerHtml = loading ? SPINNER_SVG : ""
  element.innerHTML = `<div class="status-badge ${type}">${spinnerHtml} <span></span></div>`
  element.querySelector("span").textContent = message
}

function updateLog(logEl, content) {
  if (!content || !content.trim()) {
    logEl.textContent = ""
    logEl.classList.add("hidden")
  } else {
    logEl.textContent = content
    logEl.classList.remove("hidden")
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.position = "fixed"
      ta.style.opacity = "0"
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand("copy")
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/* ---------------- Stepper & panel navigation ---------------- */

const stepperSegments = document.querySelectorAll(".stepper-segment")
const panelCapture = $("panel-capture")
const panelReview = $("panel-review")
const panelNotion = $("panel-notion")
const panelFix = $("panel-fix")
const stepperContainer = $("stepper")

function stepReached(n) {
  if (n >= 3) return state.maxStep >= 3
  if (n === 2) return Boolean(state.sessionId)
  return true
}

function setStep(n) {
  state.maxStep = Math.max(state.maxStep, n)
  stepperSegments.forEach((seg) => {
    const stepNum = Number(seg.dataset.step)
    seg.classList.toggle("active", stepNum <= n)
    const complete =
      (stepNum === 1 && Boolean(state.sessionId)) ||
      (stepNum === 2 && state.lastFields.length > 0)
    seg.classList.toggle("complete", complete)
    seg.disabled = !stepReached(stepNum)
  })
}

function goToStep(n) {
  if (n > 1 && !stepReached(n)) return
  setStep(n)
  const target = n === 1 ? panelCapture : n === 2 ? panelReview : panelNotion
  target.scrollIntoView({ behavior: "smooth", block: "start" })
}

stepperSegments.forEach((seg) => {
  seg.addEventListener("click", () => goToStep(Number(seg.dataset.step)))
})

/* ---------------- Mode tabs ---------------- */

const tabCaptureMode = $("tab-capture-mode")
const tabFixMode = $("tab-fix-mode")

const stepperSection = $("stepper-section")
const modeHeading = $("mode-heading")
const pageEyebrow = $("page-eyebrow")

function setMode(mode) {
  state.mode = mode
  tabCaptureMode.classList.toggle("active", mode === "capture")
  tabFixMode.classList.toggle("active", mode === "fix")

  stepperContainer.classList.toggle("hidden", mode === "fix")
  stepperSection.classList.toggle("hidden", mode === "fix")
  panelCapture.classList.toggle("hidden", mode === "fix")
  panelReview.classList.toggle("hidden", mode === "fix" || !state.sessionId)
  panelNotion.classList.toggle("hidden", mode === "fix" || !state.lastFields.length)
  panelFix.classList.toggle("hidden", mode === "capture")

  if (modeHeading) {
    modeHeading.textContent = mode === "fix" ? "Fix Entry" : "New Capture"
  }
  if (pageEyebrow) {
    pageEyebrow.textContent = mode === "fix" ? "Savault · Maintenance" : "Savault Content Tool"
  }

  // The stepper lives in the right column only for capture mode.
  const stepperSection = $("stepper-section")
  if (stepperSection) stepperSection.classList.toggle("hidden", mode === "fix")

  if (mode === "capture") window.scrollTo({ top: 0, behavior: "smooth" })
}

tabCaptureMode.addEventListener("click", () => setMode("capture"))
tabFixMode.addEventListener("click", () => setMode("fix"))

/* ---------------- Config / connection chips & stat cards ---------------- */

function setStat(id, { value, badge, badgeClass = "", title = "" } = {}) {
  const valueEl = $(`stat-${id}-value`)
  const badgeEl = $(`stat-${id}-badge`)
  if (!valueEl || !badgeEl) return
  valueEl.textContent = value
  if (badgeClass === "small-text") valueEl.classList.add("small-text")
  badgeEl.textContent = badge
  badgeEl.className = `stat-badge ${badgeClass}`.trim()
  if (title) badgeEl.title = title
}

function setStatsFromConfig(cfg, configError) {
  if (configError) {
    setStat("entries", { value: "—", badge: "Offline", badgeClass: "err", title: configError })
    setStat("notion", { value: "—", badge: "Offline", badgeClass: "err", title: configError })
    setStat("repo", { value: "—", badge: "Offline", badgeClass: "err", title: configError })
    return
  }

  const slugs = Array.isArray(state.allSlugs) ? state.allSlugs : null
  setStat("entries", {
    value: slugs ? String(slugs.length) : "—",
    badge: slugs ? "Live" : "Loading",
    badgeClass: slugs ? "" : "warn",
    title: slugs ? "Entries currently in the asset repo" : "Still loading the entry list",
  })

  setStat("notion", {
    value: cfg.notionConfigured ? "Connected" : "Not set",
    badge: cfg.notionConfigured ? "OK" : "Setup",
    badgeClass: cfg.notionConfigured ? "" : "warn",
    title: cfg.notionConfigured
      ? "Notion integration is configured"
      : "NOTION_TOKEN / NOTION_DATABASE_ID not set in .env",
  })

  const github = cfg.github || ""
  setStat("repo", {
    value: cfg.assetRepoOk ? (github || "Ready") : "Missing",
    badge: cfg.assetRepoOk ? "Live" : "Check",
    badgeClass: cfg.assetRepoOk ? "" : "err",
    title: cfg.assetRepoOk ? `Asset repo ready${github ? ` (${github})` : ""}` : (cfg.assetRepoMessage || "Asset repo not found"),
  })
}

// Entries count arrives asynchronously — refresh the stat card when it lands.
async function refreshEntriesStat() {
  try {
    const res = await fetch("/api/assets/list")
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "List unavailable")
    state.allSlugs = data.slugs || []
    renderFixOptions("")
    if (state.notionConfigured !== null) setStatsFromConfig(state.lastConfig || {}, "")
  } catch {
    /* loadFixSlugs reports the failure in the fix dropdown */
  }
}
async function loadConfig() {
  const notionChip = $("notion-chip")
  const repoChip = $("repo-chip")
  try {
    const res = await fetch("/api/config")
    const cfg = await res.json()
    if (!res.ok) throw new Error(cfg.error || "Config unavailable")

    state.notionConfigured = cfg.notionConfigured
    state.cdnBase = cfg.cdnBase || ""
    state.lastConfig = cfg

    if (cfg.notionConfigured) {
      notionChip.classList.add("ok")
      notionChip.title = "Notion integration is configured"
    } else {
      notionChip.classList.add("warn")
      notionChip.title = "NOTION_TOKEN / NOTION_DATABASE_ID not set in .env — “Add to Notion” will be unavailable"
      $("notion-unconfigured-note").classList.remove("hidden")
      $("notion-push-btn").disabled = true
      $("notion-push-btn").title = "Notion is not configured (.env)"
    }

    if (cfg.assetRepoOk) {
      repoChip.classList.add("ok")
      repoChip.title = `Asset repo ready (${cfg.github})`
    } else {
      repoChip.classList.add("warn")
      repoChip.title = cfg.assetRepoMessage || "Asset repo not found"
    }

    setStatsFromConfig(cfg, "")
  } catch (err) {
    notionChip.classList.add("warn")
    notionChip.title = "Could not reach the server for config"
    repoChip.classList.add("warn")
    repoChip.title = "Could not reach the server for config"
    setStatsFromConfig({}, err.message)
  }
}

/* ---------------- Notion select options ---------------- */

async function loadNotionOptions() {
  const categorySelect = $("field-category")
  const subcategorySelect = $("field-subcategory")

  try {
    const res = await fetch("/api/notion/options")
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Could not load Notion options.")

    fillSelect(categorySelect, data.category)
    fillSelect(subcategorySelect, data.subcategory)
  } catch (err) {
    fillSelect(categorySelect, [])
    fillSelect(subcategorySelect, [])
    console.warn("Notion options:", err.message)
  }
}

function fillSelect(selectEl, options) {
  selectEl.innerHTML = ""
  const blank = document.createElement("option")
  blank.value = ""
  blank.textContent = options.length ? "— Select Option —" : "— None configured in Notion —"
  selectEl.appendChild(blank)

  for (const name of options) {
    const option = document.createElement("option")
    option.value = name
    option.textContent = name
    selectEl.appendChild(option)
  }

  const customOption = document.createElement("option")
  customOption.value = "__custom__"
  customOption.textContent = "Custom / Other…"
  selectEl.appendChild(customOption)
}

function setupCustomSelectToggle(selectId, customInputId) {
  const select = $(selectId)
  const customInput = $(customInputId)

  select.addEventListener("change", () => {
    if (select.value === "__custom__") {
      customInput.classList.remove("hidden")
      customInput.focus()
    } else {
      customInput.classList.add("hidden")
      customInput.value = ""
    }
  })
}

setupCustomSelectToggle("field-pricing", "field-pricing-custom")
setupCustomSelectToggle("field-category", "field-category-custom")
setupCustomSelectToggle("field-subcategory", "field-subcategory-custom")

function selectOrCustomValue(selectId, customInputId) {
  const select = $(selectId)
  const customInput = $(customInputId)
  return select.value === "__custom__" ? customInput.value.trim() : select.value
}

/* ---------------- Capture flow (job + live progress) ---------------- */

const captureForm = $("capture-form")
const urlInput = $("url-input")
const captureBtn = $("capture-btn")
const captureBtnText = $("capture-btn-text")
const captureStatus = $("capture-status")
const captureTimeline = $("capture-timeline")
const previewsEl = $("previews")

const previewThumb = $("preview-thumbnail")
const previewFull = $("preview-fullpage")
const previewOg = $("preview-og")
const ogMissingHint = $("og-missing-hint")

const TL_STAGES = ["browser", "navigate", "settle", "meta", "analyze", "thumbnail", "scroll", "fullpage", "og"]

function resetTimeline() {
  captureTimeline.querySelectorAll(".tl-item").forEach((item) => {
    item.classList.remove("done", "active", "skipped", "error")
  })
}

function updateTimeline(job) {
  const items = Array.from(captureTimeline.querySelectorAll(".tl-item"))
  const historyStages = new Set((job.history || []).map((h) => h.stage))

  if (job.status === "done") {
    items.forEach((item) => {
      const stage = item.dataset.stage
      item.classList.add(historyStages.has(stage) ? "done" : "skipped")
    })
    return
  }

  const idx = TL_STAGES.indexOf(job.stage)
  items.forEach((item) => {
    const stage = item.dataset.stage
    const sIdx = TL_STAGES.indexOf(stage)
    item.classList.remove("done", "active", "skipped", "error")
    if (job.status === "error") {
      if (sIdx === idx) item.classList.add("error")
      else if (sIdx < idx) item.classList.add("done")
    } else if (sIdx < idx) item.classList.add("done")
    else if (sIdx === idx) item.classList.add("active")
  })
}

function pollJob(jobId) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const timer = setInterval(async () => {
      try {
        if (Date.now() - startedAt > 150000) {
          clearInterval(timer)
          reject(new Error("Capture timed out after 150 seconds."))
          return
        }

        const res = await fetch(`/api/capture/${jobId}`)
        if (!res.ok) {
          clearInterval(timer)
          const data = await res.json().catch(() => ({}))
          reject(new Error(data.error || "Capture job was lost — the server may have restarted."))
          return
        }

        const job = await res.json()
        updateTimeline(job)

        if (job.status === "done") {
          clearInterval(timer)
          resolve(job.result)
        } else if (job.status === "error") {
          clearInterval(timer)
          reject(new Error(job.error || "Capture failed."))
        }
      } catch (err) {
        clearInterval(timer)
        reject(err)
      }
    }, 400)
  })
}

function setCaptureLoading(loading) {
  captureBtn.disabled = loading
  captureBtnText.textContent = loading ? "Capturing…" : "Capture"
  const icon = $("capture-btn-icon")
  if (icon) icon.innerHTML = loading ? SPINNER_SVG : CAPTURE_ICON_SVG
  previewsEl.classList.toggle("is-loading", loading)
}

captureForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const raw = urlInput.value.trim()
  if (!raw) {
    toast("Enter a URL first.", "warning")
    urlInput.focus()
    return
  }

  captureBtn.disabled = true
  setCaptureLoading(true)
  showStatus(captureStatus, "Starting capture…", "info", true)
  resetTimeline()
  captureTimeline.classList.remove("hidden")

  panelReview.classList.add("hidden")
  panelNotion.classList.add("hidden")
  updateLog($("push-log"), "")
  setModeResetForCapture()

  try {
    const startRes = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: raw }),
    })
    const startData = await startRes.json()
    if (!startRes.ok) throw new Error(startData.error || "Could not start capture.")

    showStatus(captureStatus, "Capturing website & analyzing design…", "info", true)
    const data = await pollJob(startData.jobId)

    applyCaptureResult(data)
  } catch (err) {
    updateTimeline({ status: "error", stage: currentStage(), history: [] })
    showStatus(captureStatus, `Error: ${err.message}`, "error")
    toast(err.message, "error", 5000)
  } finally {
    setCaptureLoading(false)
  }
})

/* ---------------- Capture form ----------------

   The URL input normalizes scheme-less input live ("acme.com" becomes
   "https://acme.com/") and previews the exact URL that will be captured.
   ---------------------------------------------------------------- */

const urlPreviewWrap = $("url-preview-wrap")
const urlPreviewEl = $("url-preview")

function updateUrlPreview() {
  const normalized = normalizeUrl(urlInput.value)
  if (!normalized) {
    urlPreviewWrap.hidden = true
    urlPreviewEl.textContent = ""
    return
  }
  urlPreviewWrap.hidden = false
  urlPreviewEl.textContent = normalized
}

urlInput.addEventListener("input", updateUrlPreview)

function submitCapture() {
  if (captureForm.requestSubmit) captureForm.requestSubmit()
  else captureForm.dispatchEvent(new Event("submit", { cancelable: true }))
}

function submitIfUrlLooksReady(text) {
  if (!text || /\s/.test(text)) return
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}/i.test(text.replace(/^https?:\/\//i, ""))) return
  submitCapture()
}

urlInput.addEventListener("paste", () => {
  // Wait a tick so the pasted value is present in the field, then let the
  // browser's native URL validation decide via a real submit.
  setTimeout(() => {
    updateUrlPreview()
    submitIfUrlLooksReady(urlInput.value)
  }, 0)
})

function currentStage() {
  const active = captureTimeline.querySelector(".tl-item.active")
  return active ? active.dataset.stage : "browser"
}

function setModeResetForCapture() {
  state.sessionId = null
  state.lastFields = []
  state.maxStep = 1
  setStep(1)
}

function applyCaptureResult(data) {
  state.sessionId = data.sessionId
  state.capturedUrl = data.url

  $("field-title").value = data.title || ""
  $("field-slug").value = data.slug || ""
  $("field-hover").value = data.hoverDescription || ""
  $("field-meta").value = data.metaDescription || ""
  $("field-category").value = ""
  $("field-subcategory").value = ""
  hideCustomInput("field-category-custom")
  hideCustomInput("field-subcategory-custom")
  $("field-pricing").value = ""
  hideCustomInput("field-pricing-custom")
  $("field-is-new").checked = false
  $("field-is-sponsored").checked = false

  updateCounter($("field-hover"), $("hover-counter"), 60)
  updateCounter($("field-meta"), $("meta-counter"), 160)

  previewThumb.src = data.previews.thumbnail
  previewFull.src = data.previews.fullpage

  if (data.previews.og) {
    previewOg.src = data.previews.og
    ogMissingHint.style.display = "none"
  } else {
    previewOg.removeAttribute("src")
    ogMissingHint.style.display = "flex"
  }

  const sourceChip = $("source-url")
  sourceChip.href = data.url
  $("source-url-text").textContent = data.url.replace(/^https?:\/\//, "")
  sourceChip.classList.remove("hidden")

  renderAnalysis(data.analysis)

  if (data.error) {
    showStatus(captureStatus, `Captured with warning: ${data.error}`, "warning")
    toast("Captured with warning — check the details.", "warning")
  } else {
    showStatus(captureStatus, "Website captured successfully! Review the details below.", "success")
    toast("Capture complete.", "success")
  }

  panelReview.classList.remove("hidden")
  setStep(2)
  updateSlugHint()

  setTimeout(() => {
    panelReview.scrollIntoView({ behavior: "smooth", block: "start" })
    $("field-title").focus()
    $("field-title").select()
  }, 120)
}

function hideCustomInput(id) {
  const el = $(id)
  el.value = ""
  el.classList.add("hidden")
}

/* ---------------- Design analysis rendering ---------------- */

const analysisEl = $("analysis")

function renderAnalysis(analysis) {
  const colors = analysis?.colorPalette || []
  const fonts = analysis?.fonts || []
  const builder = analysis?.builder || ""
  const tech = analysis?.techStack || []

  if (!colors.length && !fonts.length && !tech.length && !builder) {
    analysisEl.classList.add("hidden")
    return
  }

  analysisEl.classList.remove("hidden")

  const colorsEl = $("analysis-colors")
  colorsEl.innerHTML = ""
  if (colors.length) {
    colors.slice(0, 8).forEach((hex) => {
      const swatch = document.createElement("button")
      swatch.type = "button"
      swatch.className = "swatch"
      swatch.title = `Copy ${hex}`
      swatch.innerHTML = `<span class="swatch-color" style="background:${hex}"></span><span class="swatch-code"></span>`
      swatch.querySelector(".swatch-code").textContent = hex
      swatch.addEventListener("click", async () => {
        const ok = await copyText(hex)
        toast(ok ? `${hex} copied` : "Copy failed", ok ? "success" : "error", 1800)
      })
      colorsEl.appendChild(swatch)
    })
  } else {
    colorsEl.innerHTML = '<span class="analysis-empty">No colors detected</span>'
  }

  const fontsEl = $("analysis-fonts")
  fontsEl.innerHTML = ""
  if (fonts.length) {
    fonts.slice(0, 8).forEach((font) => {
      const chip = document.createElement("span")
      chip.className = "chip"
      chip.textContent = font
      fontsEl.appendChild(chip)
    })
  } else {
    fontsEl.innerHTML = '<span class="analysis-empty">No custom fonts detected</span>'
  }

  const techEl = $("analysis-tech")
  techEl.innerHTML = ""
  if (builder && builder !== "Unknown") {
    const chip = document.createElement("span")
    chip.className = "chip builder"
    chip.textContent = builder
    techEl.appendChild(chip)
  }
  if (tech.length) {
    tech.slice(0, 8).forEach((t) => {
      const chip = document.createElement("span")
      chip.className = "chip"
      chip.textContent = t
      techEl.appendChild(chip)
    })
  }
  if (!techEl.children.length) {
    techEl.innerHTML = '<span class="analysis-empty">Nothing detected</span>'
  }
}

/* ---------------- Slug handling ---------------- */

const fieldSlug = $("field-slug")
const slugHint = $("slug-hint")

fieldSlug.addEventListener("input", () => {
  // Live-normalize to a URL-safe slug while typing.
  const cursorAtEnd = fieldSlug.selectionStart === fieldSlug.value.length
  fieldSlug.value = fieldSlug.value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")

  if (cursorAtEnd) fieldSlug.value = fieldSlug.value.replace(/-+/g, "-")
  updateSlugHint()
})

function updateSlugHint() {
  const slug = fieldSlug.value.replace(/^-+|-+$/g, "")

  if (!state.sessionId) {
    slugHint.textContent = ""
    return
  }
  if (!slug) {
    slugHint.textContent = "Slug is required."
    slugHint.className = "field-hint error"
    return
  }
  if (state.allSlugs === null) {
    slugHint.textContent = `Will be saved as ${slug}-thumbnail.webp`
    slugHint.className = "field-hint"
    return
  }
  if (state.allSlugs.includes(slug)) {
    slugHint.textContent = `“${slug}” already exists — saving will overwrite its assets. Use “Fix Entry” to update in place instead.`
    slugHint.className = "field-hint warn"
    return
  }
  slugHint.textContent = `Available — will be saved as ${slug}-thumbnail.webp`
  slugHint.className = "field-hint ok"
}

/* ---------------- Character counters ---------------- */

function updateCounter(input, counterEl, max) {
  const len = (input.value || "").length
  counterEl.textContent = `${len} / ${max}`
  counterEl.classList.toggle("over", len > max)
}

$("field-hover").addEventListener("input", (e) => updateCounter(e.target, $("hover-counter"), 60))
$("field-meta").addEventListener("input", (e) => updateCounter(e.target, $("meta-counter"), 160))

/* ---------------- Replace preview images (review) ---------------- */

document.querySelectorAll("#panel-review .replace-input").forEach((input) => {
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file || !state.sessionId) return

    const type = e.target.dataset.type
    const formData = new FormData()
    formData.append("file", file)
    formData.append("sessionId", state.sessionId)
    formData.append("type", type)

    try {
      const res = await fetch("/api/replace", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Replace failed.")

      if (type === "thumbnail") previewThumb.src = data.previewUrl
      if (type === "fullpage") previewFull.src = data.previewUrl
      if (type === "og") {
        previewOg.src = data.previewUrl
        ogMissingHint.style.display = "none"
      }
      toast(`${type} image replaced.`, "success", 2200)
    } catch (err) {
      toast(`Replace failed: ${err.message}`, "error", 5000)
    } finally {
      input.value = ""
    }
  })
})

/* ---------------- Save (optimize & copy into asset repo) ---------------- */

const saveBtn = $("save-btn")
const saveStatus = $("save-status")

saveBtn.addEventListener("click", async () => {
  if (!state.sessionId) return

  const title = $("field-title").value.trim()
  const slug = fieldSlug.value.replace(/^-+|-+$/g, "")

  if (!title) {
    showStatus(saveStatus, "Title is required.", "error")
    $("field-title").focus()
    return
  }
  if (!slug) {
    showStatus(saveStatus, "Slug is required.", "error")
    fieldSlug.focus()
    return
  }

  saveBtn.disabled = true
  showStatus(saveStatus, "Optimizing images with Sharp & copying to the asset repo…", "info", true)

  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: state.sessionId,
        title,
        slug,
        hoverDescription: $("field-hover").value,
        metaDescription: $("field-meta").value,
        category: selectOrCustomValue("field-category", "field-category-custom"),
        subcategory: selectOrCustomValue("field-subcategory", "field-subcategory-custom"),
        pricingType: selectOrCustomValue("field-pricing", "field-pricing-custom"),
        isNew: $("field-is-new").checked,
        isSponsored: $("field-is-sponsored").checked,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (/unknown session/i.test(data.error || "")) {
        throw new Error("Session expired (server restarted?) — please capture the site again.")
      }
      throw new Error(data.error || "Save failed.")
    }

    showStatus(saveStatus, `Assets saved under slug “${data.slug}”.`, "success")
    state.lastFields = data.fields
    renderNotionFields(data.fields)

    if (state.allSlugs && !state.allSlugs.includes(data.slug)) {
      state.allSlugs.push(data.slug)
      state.allSlugs.sort()
      renderFixOptions($("fix-search").value.trim().toLowerCase())
    }
    updateSlugHint()

    panelNotion.classList.remove("hidden")
    setStep(3)
    toast("Assets optimized & saved.", "success")
    setTimeout(() => panelNotion.scrollIntoView({ behavior: "smooth", block: "start" }), 120)
  } catch (err) {
    showStatus(saveStatus, `Error: ${err.message}`, "error")
    toast(err.message, "error", 5000)
  } finally {
    saveBtn.disabled = false
  }
})

/* ---------------- Notion fields (grouped) ---------------- */

const notionFieldsEl = $("notion-fields")

const FIELD_GROUPS = [
  {
    title: "Content",
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    keys: [
      "title", "slug", "hover_description", "category", "subcategory",
      "pricing_type", "is_new", "is_sponsored", "meta_description", "added_date",
    ],
  },
  {
    title: "Links & Assets",
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    keys: ["thumbnail_url", "fullpage_url", "og_image_url", "external_link"],
  },
  {
    title: "Design",
    icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    keys: ["fonts", "color_palette", "builder", "tech_stack"],
  },
]

function renderNotionFields(fields) {
  notionFieldsEl.innerHTML = ""

  for (const group of FIELD_GROUPS) {
    const groupFields = fields.filter((f) => group.keys.includes(f.key))
    if (!groupFields.length) continue

    const groupEl = document.createElement("div")
    groupEl.className = "notion-group"

    const titleEl = document.createElement("div")
    titleEl.className = "notion-group-title"
    titleEl.innerHTML = group.icon
    const titleText = document.createElement("span")
    titleText.textContent = group.title
    titleEl.appendChild(titleText)
    groupEl.appendChild(titleEl)

    for (const field of groupFields) {
      const row = document.createElement("div")
      row.className = "notion-field"

      const label = document.createElement("span")
      label.className = "label"
      label.textContent = field.label

      const value = document.createElement("span")
      value.className = "value"
      value.textContent = field.value || "—"
      value.title = field.value || ""

      const btn = document.createElement("button")
      btn.type = "button"
      btn.textContent = "Copy"
      btn.addEventListener("click", async () => {
        const ok = await copyText(field.value || "")
        if (ok) {
          btn.textContent = "✓ Copied"
          btn.classList.add("copied")
          setTimeout(() => {
            btn.textContent = "Copy"
            btn.classList.remove("copied")
          }, 1200)
        } else {
          toast("Clipboard unavailable", "error")
        }
      })

      row.append(label, value, btn)
      groupEl.appendChild(row)
    }

    notionFieldsEl.appendChild(groupEl)
  }
}

/* ---------------- Copy all / Notion push / GitHub push ---------------- */

const copyAllBtn = $("copy-all-btn")
const notionPushBtn = $("notion-push-btn")
const notionPushStatus = $("notion-push-status")
const pushBtn = $("push-btn")
const pushLog = $("push-log")

copyAllBtn.addEventListener("click", async () => {
  const block = state.lastFields.map((f) => `${f.label}: ${f.value}`).join("\n")
  const ok = await copyText(block)
  if (ok) {
    copyAllBtn.textContent = "✓ All Copied"
    toast("All fields copied to clipboard.", "success", 2000)
    setTimeout(() => {
      copyAllBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="0"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy All Fields'
    }, 1500)
  } else {
    toast("Clipboard unavailable", "error")
  }
})

notionPushBtn.addEventListener("click", async () => {
  if (!state.lastFields.length) return
  notionPushBtn.disabled = true
  showStatus(notionPushStatus, "Syncing entry properties with the Notion API…", "info", true)

  try {
    const res = await fetch("/api/notion/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: state.lastFields }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to add to Notion.")

    let message = "Page successfully created in Notion!"
    if (data.unmatched && data.unmatched.length > 0) {
      message += ` (Skipped unmapped properties: ${data.unmatched.join(", ")})`
    }
    showStatus(notionPushStatus, message, "success")

    if (data.workerRefresh?.attempted) {
      const wr = data.workerRefresh
      const detail = wr.ok
        ? ` · extension archive refreshed${wr.itemCount ? ` (${wr.itemCount} items)` : ""}`
        : ` · archive refresh failed (${wr.reason || "unknown"})`
      const note = document.createElement("span")
      note.className = "worker-refresh-note"
      note.style.display = "block"
      note.style.opacity = "0.75"
      note.textContent = detail
      notionPushStatus.appendChild(note)
    }

    if (data.pageUrl) {
      notionPushStatus.querySelectorAll(".status-link").forEach((el) => el.remove())
      const link = document.createElement("a")
      link.className = "status-link"
      link.href = data.pageUrl
      link.target = "_blank"
      link.rel = "noopener"
      link.textContent = "Open page in Notion ↗"
      notionPushStatus.appendChild(link)
    }

    toast("Notion entry created.", "success")
  } catch (err) {
    showStatus(notionPushStatus, `Error: ${err.message}`, "error")
    toast(err.message, "error", 5000)
  } finally {
    notionPushBtn.disabled = false
  }
})

pushBtn.addEventListener("click", async () => {
  if (!state.sessionId) return
  pushBtn.disabled = true
  updateLog(pushLog, "Pushing WebP assets to the GitHub repository…")

  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Push failed.")

    updateLog(pushLog, (data.log || []).join("\n") + "\n\n" + (data.message || ""))
    if (data.ok) {
      const wr = data.workerRefresh
      if (wr?.attempted && !wr.ok) {
        updateLog(pushLog, (data.log || []).join("\n") + `\n\nArchive worker refresh failed: ${wr.reason || "unknown"}`)
        toast("Assets pushed, but archive worker refresh failed — see log.", "warning", 5000)
      } else {
        toast("Assets pushed to GitHub." + (wr?.ok ? " Archive refreshed." : ""), "success")
      }
    } else {
      toast(data.message || "Push failed — see log.", "error", 5000)
    }
  } catch (err) {
    updateLog(pushLog, `Error: ${err.message}`)
    toast(err.message, "error", 5000)
  } finally {
    pushBtn.disabled = false
  }
})

/* ---------------- Fix Existing Entry ---------------- */

const fixSearch = $("fix-search")
const fixSlugSelect = $("fix-slug-select")
const fixCount = $("fix-count")
const fixPreviewThumb = $("fix-preview-thumbnail")
const fixPreviewFull = $("fix-preview-fullpage")
const fixPushRow = $("fix-push-row")
const fixPushBtn = $("fix-push-btn")
const fixLog = $("fix-log")

async function loadFixSlugs() {
  try {
    const res = await fetch("/api/assets/list")
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Could not load existing entries.")

    state.allSlugs = data.slugs || []
    renderFixOptions("")
    if (state.notionConfigured !== null) setStatsFromConfig(state.lastConfig || {}, "")
  } catch (err) {
    state.allSlugs = null
    fixSlugSelect.innerHTML = ""
    const blank = document.createElement("option")
    blank.value = ""
    blank.textContent = "— Asset repo unavailable —"
    fixSlugSelect.appendChild(blank)
    fixCount.textContent = ""
    fixCount.title = err.message
  }
}

function renderFixOptions(filter) {
  const all = state.allSlugs || []
  const filtered = filter ? all.filter((s) => s.includes(filter)) : all

  fixSlugSelect.innerHTML = ""
  const blank = document.createElement("option")
  blank.value = ""
  blank.textContent = filtered.length ? "— Select an existing entry —" : "— No matching entries —"
  fixSlugSelect.appendChild(blank)

  for (const slug of filtered) {
    const option = document.createElement("option")
    option.value = slug
    option.textContent = slug
    fixSlugSelect.appendChild(option)
  }

  if (state.currentFixSlug && filtered.includes(state.currentFixSlug)) {
    fixSlugSelect.value = state.currentFixSlug
  }

  fixCount.textContent = filter
    ? `${filtered.length} of ${all.length} entries`
    : `${all.length} ${all.length === 1 ? "entry" : "entries"}`
}

fixSearch.addEventListener("input", () => {
  renderFixOptions(fixSearch.value.trim().toLowerCase())
})

fixSlugSelect.addEventListener("change", () => {
  state.currentFixSlug = fixSlugSelect.value || null

  if (!state.currentFixSlug) {
    fixPushRow.classList.add("hidden")
    updateLog(fixLog, "")
    fixPreviewThumb.removeAttribute("src")
    fixPreviewFull.removeAttribute("src")
    return
  }

  const t = Date.now()
  fixPreviewThumb.src = `/assets-preview/thumbnails/${state.currentFixSlug}-thumbnail.webp?t=${t}`
  fixPreviewFull.src = `/assets-preview/fullpages/${state.currentFixSlug}-fullpage.webp?t=${t}`
  fixPushRow.classList.remove("hidden")
  updateLog(fixLog, "")
})

document.querySelectorAll(".fix-replace-input").forEach((input) => {
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!state.currentFixSlug) {
      toast("Select an entry in the dropdown first.", "warning")
      return
    }

    const type = e.target.dataset.type
    const formData = new FormData()
    formData.append("file", file)
    formData.append("slug", state.currentFixSlug)
    formData.append("type", type)

    updateLog(fixLog, `Optimizing replaced ${type}…`)
    try {
      const res = await fetch("/api/fix/replace", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Replace failed.")

      if (type === "thumbnail") fixPreviewThumb.src = data.previewUrl
      if (type === "fullpage") fixPreviewFull.src = data.previewUrl
      updateLog(fixLog, `${type} image replaced locally! Click “Push & Purge CDN Cache” to publish.`)
      toast(`${type} replaced locally.`, "success", 2200)
    } catch (err) {
      updateLog(fixLog, `Error: ${err.message}`)
      toast(err.message, "error", 5000)
    } finally {
      input.value = ""
    }
  })
})

fixPushBtn.addEventListener("click", async () => {
  if (!state.currentFixSlug) {
    toast("Select an entry in the dropdown first.", "warning")
    return
  }
  fixPushBtn.disabled = true
  updateLog(fixLog, "Pushing assets to GitHub and purging the jsDelivr CDN cache…")

  try {
    const res = await fetch("/api/fix/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: state.currentFixSlug }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Push failed.")

    const gitLog = (data.log || []).join("\n")
    const purgeLog = (data.purge || [])
      .map((p) => `Purge ${p.url.split("/").pop()} -> ${p.ok ? "Success (200)" : "Failed"}`)
      .join("\n")

    updateLog(fixLog, `${gitLog}\n\n${data.message || ""}\n\n${purgeLog}`)
    const wr = data.workerRefresh
    if (wr?.attempted && !wr.ok) {
      updateLog(fixLog, `${gitLog}\n\n${data.message || ""}\n\n${purgeLog}\n\nArchive worker refresh failed: ${wr.reason || "unknown"}`)
    }
    if (data.ok) toast("Assets pushed & CDN purged." + (wr?.ok ? " Archive refreshed." : ""), "success")
    else toast(data.message || "Push failed — see log.", "error", 5000)
  } catch (err) {
    updateLog(fixLog, `Error: ${err.message}`)
    toast(err.message, "error", 5000)
  } finally {
    fixPushBtn.disabled = false
  }
})

/* ---------------- Lightbox image viewer ---------------- */

const lightbox = $("lightbox")
const lightboxImg = $("lightbox-img")
const lightboxTitle = $("lightbox-title")
const lightboxOpen = $("lightbox-open")

function openLightbox(src, title) {
  lightboxImg.src = src
  lightboxTitle.textContent = title || "Preview"
  lightboxOpen.href = src
  lightbox.classList.remove("hidden")
  document.body.style.overflow = "hidden"
}

function closeLightbox() {
  if (lightbox.classList.contains("hidden")) return
  lightbox.classList.add("hidden")
  lightboxImg.src = ""
  document.body.style.overflow = ""
}

lightbox.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeLightbox()
})

document.addEventListener("click", (e) => {
  const viewBtn = e.target.closest(".btn-view-image")
  if (!viewBtn) return
  const imgEl = $(viewBtn.dataset.target)
  if (imgEl && imgEl.getAttribute("src")) {
    openLightbox(imgEl.src, viewBtn.dataset.title || "Preview")
  } else {
    toast("No image available to view yet.", "warning")
  }
})

/* ---------------- Global keyboard & paste shortcuts ---------------- */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeLightbox()
    return
  }

  if (e.key === "/" && state.mode === "capture") {
    const tag = document.activeElement?.tagName?.toLowerCase()
    if (tag !== "input" && tag !== "textarea" && tag !== "select") {
      e.preventDefault()
      urlInput.focus()
      urlInput.select()
    }
  }
})

document.addEventListener("paste", (e) => {
  if (state.mode !== "capture") return
  const target = e.target
  if (target instanceof HTMLElement && target.closest("input, textarea, select")) return

  const text = (e.clipboardData || window.clipboardData)?.getData("text")?.trim()
  if (!text || /\s/.test(text)) return

  e.preventDefault()
  urlInput.value = text
  updateUrlPreview()
  urlInput.focus()
  toast("URL pasted — press Enter to capture.", "info", 2500)
})

/* ---------------- Init ---------------- */

setStep(1)
loadConfig()
loadNotionOptions()
loadFixSlugs()
window.addEventListener("DOMContentLoaded", () => urlInput.focus())
