let sessionId = null

const stepperSegments = document.querySelectorAll(".stepper-segment")
const stepperContainer = document.getElementById("stepper")

function setStep(n) {
  stepperSegments.forEach((seg) => {
    const stepNum = Number(seg.dataset.step)
    if (stepNum <= n) {
      seg.classList.add("active")
    } else {
      seg.classList.remove("active")
    }
  })
}

// --- Topbar Tab Navigation ---
const tabCaptureMode = document.getElementById("tab-capture-mode")
const tabFixMode = document.getElementById("tab-fix-mode")
const panelCapture = document.getElementById("panel-capture")
const panelReview = document.getElementById("panel-review")
const panelNotion = document.getElementById("panel-notion")
const panelFix = document.getElementById("panel-fix")

tabCaptureMode.addEventListener("click", () => {
  tabCaptureMode.classList.add("active")
  tabFixMode.classList.remove("active")
  
  stepperContainer.classList.remove("hidden")
  panelCapture.classList.remove("hidden")
  panelFix.classList.add("hidden")
  
  if (sessionId) {
    panelReview.classList.remove("hidden")
    if (lastFields.length > 0) panelNotion.classList.remove("hidden")
  }
})

tabFixMode.addEventListener("click", () => {
  tabFixMode.classList.add("active")
  tabCaptureMode.classList.remove("active")
  
  stepperContainer.classList.add("hidden")
  panelCapture.classList.add("hidden")
  panelReview.classList.add("hidden")
  panelNotion.classList.add("hidden")
  panelFix.classList.remove("hidden")
})

function showStatus(element, message, type = "info", loading = false) {
  if (!message) {
    element.innerHTML = ""
    return
  }
  const spinnerHtml = loading
    ? `<svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`
    : ""
  element.innerHTML = `<div class="status-badge ${type}">${spinnerHtml} <span>${message}</span></div>`
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

// --- View Full Resolution Image Handler ---
document.addEventListener("click", (e) => {
  const viewBtn = e.target.closest(".btn-view-image")
  if (viewBtn) {
    const targetId = viewBtn.dataset.target
    const imgEl = document.getElementById(targetId)
    if (imgEl && imgEl.src && imgEl.src !== window.location.href) {
      window.open(imgEl.src, "_blank")
    } else {
      alert("No image available to view yet.")
    }
  }
})

loadNotionOptions()

async function loadNotionOptions() {
  const categorySelect = document.getElementById("field-category")
  const subcategorySelect = document.getElementById("field-subcategory")

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
  const select = document.getElementById(selectId)
  const customInput = document.getElementById(customInputId)

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

setupCustomSelectToggle("field-category", "field-category-custom")
setupCustomSelectToggle("field-subcategory", "field-subcategory-custom")

function selectOrCustomValue(selectId, customInputId) {
  const select = document.getElementById(selectId)
  const customInput = document.getElementById(customInputId)
  return select.value === "__custom__" ? customInput.value.trim() : select.value
}

const captureForm = document.getElementById("capture-form")
const urlInput = document.getElementById("url-input")
const captureBtn = document.getElementById("capture-btn")
const captureBtnText = document.getElementById("capture-btn-text")
const captureStatus = document.getElementById("capture-status")

const previewThumb = document.getElementById("preview-thumbnail")
const previewFull = document.getElementById("preview-fullpage")
const previewOg = document.getElementById("preview-og")
const ogMissingHint = document.getElementById("og-missing-hint")

const fieldTitle = document.getElementById("field-title")
const fieldSlug = document.getElementById("field-slug")
const fieldHover = document.getElementById("field-hover")
const fieldMeta = document.getElementById("field-meta")
const fieldCategory = document.getElementById("field-category")
const fieldSubcategory = document.getElementById("field-subcategory")
const fieldPricing = document.getElementById("field-pricing")
const fieldIsNew = document.getElementById("field-is-new")
const fieldIsSponsored = document.getElementById("field-is-sponsored")

const saveBtn = document.getElementById("save-btn")
const saveStatus = document.getElementById("save-status")

const notionFieldsEl = document.getElementById("notion-fields")
const copyAllBtn = document.getElementById("copy-all-btn")
const notionPushBtn = document.getElementById("notion-push-btn")
const notionPushStatus = document.getElementById("notion-push-status")
const pushBtn = document.getElementById("push-btn")
const pushLog = document.getElementById("push-log")

let lastFields = []

captureForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  captureBtn.disabled = true
  captureBtnText.textContent = "Capturing…"
  showStatus(captureStatus, "Capturing website & analyzing design... this may take 15–30 seconds.", "info", true)
  
  panelReview.classList.add("hidden")
  panelNotion.classList.add("hidden")
  updateLog(pushLog, "")
  setStep(1)

  try {
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value }),
    })
    const data = await res.json()

    if (!res.ok) throw new Error(data.error || "Capture failed.")

    sessionId = data.sessionId
    fieldTitle.value = data.title || ""
    fieldSlug.value = data.slug || ""
    fieldHover.value = data.hoverDescription || ""
    fieldMeta.value = data.metaDescription || ""
    fieldCategory.value = ""
    fieldSubcategory.value = ""
    document.getElementById("field-category-custom").value = ""
    document.getElementById("field-category-custom").classList.add("hidden")
    document.getElementById("field-subcategory-custom").value = ""
    document.getElementById("field-subcategory-custom").classList.add("hidden")
    fieldPricing.value = ""
    fieldIsNew.checked = false
    fieldIsSponsored.checked = false

    previewThumb.src = data.previews.thumbnail
    previewFull.src = data.previews.fullpage

    if (data.previews.og) {
      previewOg.src = data.previews.og
      ogMissingHint.style.display = "none"
    } else {
      previewOg.removeAttribute("src")
      ogMissingHint.style.display = "block"
    }

    if (data.error) {
      showStatus(captureStatus, `Captured with warning: ${data.error}`, "warning")
    } else {
      showStatus(captureStatus, "Website captured successfully! Review details below.", "success")
    }

    panelReview.classList.remove("hidden")
    setStep(2)
  } catch (err) {
    showStatus(captureStatus, `Error: ${err.message}`, "warning")
  } finally {
    captureBtn.disabled = false
    captureBtnText.textContent = "Capture"
  }
})

document.querySelectorAll("#panel-review .replace-input").forEach((input) => {
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file || !sessionId) return

    const type = e.target.dataset.type
    const formData = new FormData()
    formData.append("file", file)
    formData.append("sessionId", sessionId)
    formData.append("type", type)

    const res = await fetch("/api/replace", { method: "POST", body: formData })
    const data = await res.json()
    if (!res.ok) {
      alert(`Replace failed: ${data.error}`)
      return
    }

    if (type === "thumbnail") previewThumb.src = data.previewUrl
    if (type === "fullpage") previewFull.src = data.previewUrl
    if (type === "og") {
      previewOg.src = data.previewUrl
      ogMissingHint.style.display = "none"
    }
  })
})

saveBtn.addEventListener("click", async () => {
  if (!sessionId) return
  saveBtn.disabled = true
  showStatus(saveStatus, "Optimizing images with Sharp & copying to savault-assets...", "info", true)

  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        title: fieldTitle.value,
        slug: fieldSlug.value,
        hoverDescription: fieldHover.value,
        metaDescription: fieldMeta.value,
        category: selectOrCustomValue("field-category", "field-category-custom"),
        subcategory: selectOrCustomValue("field-subcategory", "field-subcategory-custom"),
        pricingType: fieldPricing.value,
        isNew: fieldIsNew.checked,
        isSponsored: fieldIsSponsored.checked,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Save failed.")

    showStatus(saveStatus, `Assets saved under slug "${data.slug}"!`, "success")
    lastFields = data.fields
    renderNotionFields(data.fields)
    panelNotion.classList.remove("hidden")
    setStep(3)
  } catch (err) {
    showStatus(saveStatus, `Error: ${err.message}`, "warning")
  } finally {
    saveBtn.disabled = false
  }
})

function renderNotionFields(fields) {
  notionFieldsEl.innerHTML = ""
  fields.forEach((field) => {
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
    btn.textContent = "Copy"
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(field.value || "")
      btn.textContent = "✓ Copied"
      btn.style.background = "#F1F5F9"
      btn.style.color = "#0F172A"
      setTimeout(() => {
        btn.textContent = "Copy"
        btn.style.background = ""
        btn.style.color = ""
      }, 1200)
    })

    row.append(label, value, btn)
    notionFieldsEl.appendChild(row)
  })
}

copyAllBtn.addEventListener("click", () => {
  const block = lastFields.map((f) => `${f.label}: ${f.value}`).join("\n")
  navigator.clipboard.writeText(block)
  copyAllBtn.textContent = "✓ All Copied"
  setTimeout(() => (copyAllBtn.textContent = "Copy All Fields"), 1500)
})

pushBtn.addEventListener("click", async () => {
  if (!sessionId) return
  pushBtn.disabled = true
  updateLog(pushLog, "Pushing WebP assets to GitHub repository...")

  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
    const data = await res.json()
    updateLog(pushLog, (data.log || []).join("\n") + "\n\n" + (data.message || ""))
  } catch (err) {
    updateLog(pushLog, `Error: ${err.message}`)
  } finally {
    pushBtn.disabled = false
  }
})

notionPushBtn.addEventListener("click", async () => {
  if (!lastFields.length) return
  notionPushBtn.disabled = true
  showStatus(notionPushStatus, "Syncing entry properties with Notion API...", "info", true)

  try {
    const res = await fetch("/api/notion/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: lastFields }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to add to Notion.")

    let message = "Page successfully created in Notion!"
    if (data.unmatched && data.unmatched.length > 0) {
      message += ` (Skipped unmapped properties: ${data.unmatched.join(", ")})`
    }
    showStatus(notionPushStatus, message, "success")
  } catch (err) {
    showStatus(notionPushStatus, `Error: ${err.message}`, "warning")
  } finally {
    notionPushBtn.disabled = false
  }
})

// --- Fix Existing Entry Logic ---
const fixSlugSelect = document.getElementById("fix-slug-select")
const fixPreviewThumb = document.getElementById("fix-preview-thumbnail")
const fixPreviewFull = document.getElementById("fix-preview-fullpage")
const fixPushRow = document.getElementById("fix-push-row")
const fixPushBtn = document.getElementById("fix-push-btn")
const fixLog = document.getElementById("fix-log")

let currentFixSlug = null

loadFixSlugs()

async function loadFixSlugs() {
  try {
    const res = await fetch("/api/assets/list")
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Could not load existing entries.")

    fixSlugSelect.innerHTML = ""
    const blank = document.createElement("option")
    blank.value = ""
    blank.textContent = data.slugs.length ? "— Select an existing entry —" : "— No entries found —"
    fixSlugSelect.appendChild(blank)

    for (const slug of data.slugs) {
      const option = document.createElement("option")
      option.value = slug
      option.textContent = slug
      fixSlugSelect.appendChild(option)
    }
  } catch (err) {
    updateLog(fixLog, `Error: ${err.message}`)
  }
}

fixSlugSelect.addEventListener("change", () => {
  currentFixSlug = fixSlugSelect.value || null

  if (!currentFixSlug) {
    fixPushRow.classList.add("hidden")
    updateLog(fixLog, "")
    fixPreviewThumb.removeAttribute("src")
    fixPreviewFull.removeAttribute("src")
    return
  }

  const t = Date.now()
  fixPreviewThumb.src = `/assets-preview/thumbnails/${currentFixSlug}-thumbnail.webp?t=${t}`
  fixPreviewFull.src = `/assets-preview/fullpages/${currentFixSlug}-fullpage.webp?t=${t}`
  fixPushRow.classList.remove("hidden")
  updateLog(fixLog, "")
})

document.querySelectorAll(".fix-replace-input").forEach((input) => {
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file || !currentFixSlug) {
      if (!currentFixSlug) alert("Please select an entry in the dropdown first.")
      return
    }

    const type = e.target.dataset.type
    const formData = new FormData()
    formData.append("file", file)
    formData.append("slug", currentFixSlug)
    formData.append("type", type)

    updateLog(fixLog, `Optimizing replaced ${type}...`)
    const res = await fetch("/api/fix/replace", { method: "POST", body: formData })
    const data = await res.json()
    if (!res.ok) {
      updateLog(fixLog, `Error: ${data.error}`)
      return
    }

    if (type === "thumbnail") fixPreviewThumb.src = data.previewUrl
    if (type === "fullpage") fixPreviewFull.src = data.previewUrl
    updateLog(fixLog, `${type} image replaced locally! Click "Push & Purge CDN Cache" to publish.`)
  })
})

fixPushBtn.addEventListener("click", async () => {
  if (!currentFixSlug) {
    alert("Please select an entry in the dropdown first.")
    return
  }
  fixPushBtn.disabled = true
  updateLog(fixLog, "Pushing assets to GitHub and purging jsDelivr CDN cache...")

  try {
    const res = await fetch("/api/fix/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: currentFixSlug }),
    })
    const data = await res.json()

    const gitLog = (data.log || []).join("\n")
    const purgeLog = (data.purge || [])
      .map((p) => `Purge ${p.url.split("/").pop()} -> ${p.ok ? "Success (200)" : "Failed"}`)
      .join("\n")

    updateLog(fixLog, `${gitLog}\n\n${data.message || ""}\n\n${purgeLog}`)
  } catch (err) {
    updateLog(fixLog, `Error: ${err.message}`)
  } finally {
    fixPushBtn.disabled = false
  }
})
