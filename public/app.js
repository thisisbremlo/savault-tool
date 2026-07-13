let sessionId = null

const stepperSegments = document.querySelectorAll(".stepper-segment")
function setStep(n) {
  stepperSegments.forEach((seg) => {
    if (Number(seg.dataset.step) <= n) seg.classList.add("active")
  })
}

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
    // Fall back to a plain empty option so the form still works
    // even if Notion isn't reachable/configured yet.
    fillSelect(categorySelect, [])
    fillSelect(subcategorySelect, [])
    console.warn("Notion options:", err.message)
  }
}

function fillSelect(selectEl, options) {
  selectEl.innerHTML = ""
  const blank = document.createElement("option")
  blank.value = ""
  blank.textContent = options.length ? "— select —" : "— none in Notion —"
  selectEl.appendChild(blank)

  for (const name of options) {
    const option = document.createElement("option")
    option.value = name
    option.textContent = name
    selectEl.appendChild(option)
  }

  const customOption = document.createElement("option")
  customOption.value = "__custom__"
  customOption.textContent = "Sonstiges…"
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

// Returns the select's chosen value, or the typed custom value if
// "Sonstiges…" was picked.
function selectOrCustomValue(selectId, customInputId) {
  const select = document.getElementById(selectId)
  const customInput = document.getElementById(customInputId)
  return select.value === "__custom__" ? customInput.value.trim() : select.value
}

const captureForm = document.getElementById("capture-form")
const urlInput = document.getElementById("url-input")
const captureBtn = document.getElementById("capture-btn")
const captureStatus = document.getElementById("capture-status")

const panelReview = document.getElementById("panel-review")
const panelNotion = document.getElementById("panel-notion")

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
  captureStatus.textContent = "Capturing… this can take up to a minute."
  panelReview.classList.add("hidden")
  panelNotion.classList.add("hidden")
  stepperSegments.forEach((seg) => seg.classList.remove("active"))
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

    captureStatus.textContent = data.error
      ? `Captured with a warning: ${data.error}`
      : "Captured. Review below before saving."

    panelReview.classList.remove("hidden")
    setStep(2)
  } catch (err) {
    captureStatus.textContent = `Error: ${err.message}`
  } finally {
    captureBtn.disabled = false
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
  saveStatus.textContent = "Optimizing and copying into savault-assets…"

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

    saveStatus.textContent = `Saved as "${data.slug}".`
    lastFields = data.fields
    renderNotionFields(data.fields)
    panelNotion.classList.remove("hidden")
    setStep(3)
  } catch (err) {
    saveStatus.textContent = `Error: ${err.message}`
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
      btn.textContent = "Copied"
      setTimeout(() => (btn.textContent = "Copy"), 1200)
    })

    row.append(label, value, btn)
    notionFieldsEl.appendChild(row)
  })
}

copyAllBtn.addEventListener("click", () => {
  const block = lastFields.map((f) => `${f.label}: ${f.value}`).join("\n")
  navigator.clipboard.writeText(block)
  copyAllBtn.textContent = "Copied"
  setTimeout(() => (copyAllBtn.textContent = "Copy all as block"), 1200)
})

pushBtn.addEventListener("click", async () => {
  if (!sessionId) return
  pushBtn.disabled = true
  pushLog.textContent = "Pushing…"

  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
    const data = await res.json()
    pushLog.textContent = (data.log || []).join("\n") + "\n\n" + (data.message || "")
  } catch (err) {
    pushLog.textContent = `Error: ${err.message}`
  } finally {
    pushBtn.disabled = false
  }
})


notionPushBtn.addEventListener("click", async () => {
  if (!lastFields.length) return
  notionPushBtn.disabled = true
  notionPushStatus.textContent = "Adding to Notion…"

  try {
    const res = await fetch("/api/notion/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: lastFields }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "Failed to add to Notion.")

    let message = "Added to Notion."
    if (data.unmatched && data.unmatched.length > 0) {
      message += ` (No matching property for: ${data.unmatched.join(", ")})`
    }
    notionPushStatus.textContent = message
  } catch (err) {
    notionPushStatus.textContent = `Error: ${err.message}`
  } finally {
    notionPushBtn.disabled = false
  }
})

// --- Fix existing entry ------------------------------------------------------

const fixSlugSelect = document.getElementById("fix-slug-select")
const fixPreviewsEl = document.getElementById("fix-previews")
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
    blank.textContent = data.slugs.length ? "— Eintrag wählen —" : "— keine Einträge gefunden —"
    fixSlugSelect.appendChild(blank)

    for (const slug of data.slugs) {
      const option = document.createElement("option")
      option.value = slug
      option.textContent = slug
      fixSlugSelect.appendChild(option)
    }
  } catch (err) {
    fixLog.textContent = `Error: ${err.message}`
  }
}

fixSlugSelect.addEventListener("change", () => {
  currentFixSlug = fixSlugSelect.value || null

  if (!currentFixSlug) {
    fixPreviewsEl.classList.add("hidden")
    fixPushRow.classList.add("hidden")
    fixLog.classList.add("hidden")
    fixPreviewThumb.removeAttribute("src")
    fixPreviewFull.removeAttribute("src")
    return
  }

  const t = Date.now()
  fixPreviewThumb.src = `/assets-preview/thumbnails/${currentFixSlug}-thumbnail.webp?t=${t}`
  fixPreviewFull.src = `/assets-preview/fullpages/${currentFixSlug}-fullpage.webp?t=${t}`
  fixPreviewsEl.classList.remove("hidden")
  fixPushRow.classList.remove("hidden")
  fixLog.classList.add("hidden")
  fixLog.textContent = ""
})

document.querySelectorAll(".fix-replace-input").forEach((input) => {
  input.addEventListener("change", async (e) => {
    const file = e.target.files[0]
    if (!file || !currentFixSlug) {
      if (!currentFixSlug) alert("Erst einen Eintrag im Dropdown auswählen.")
      return
    }

    const type = e.target.dataset.type
    const formData = new FormData()
    formData.append("file", file)
    formData.append("slug", currentFixSlug)
    formData.append("type", type)

    fixLog.classList.remove("hidden")
    fixLog.textContent = `Optimizing ${type}…`
    const res = await fetch("/api/fix/replace", { method: "POST", body: formData })
    const data = await res.json()
    if (!res.ok) {
      fixLog.textContent = `Error: ${data.error}`
      return
    }

    if (type === "thumbnail") fixPreviewThumb.src = data.previewUrl
    if (type === "fullpage") fixPreviewFull.src = data.previewUrl
    fixLog.textContent = `${type} replaced locally. Click "Push & Purge" to publish.`
  })
})

fixPushBtn.addEventListener("click", async () => {
  if (!currentFixSlug) {
    alert("Erst einen Eintrag im Dropdown auswählen.")
    return
  }
  fixPushBtn.disabled = true
  fixLog.classList.remove("hidden")
  fixLog.textContent = "Pushing and purging…"

  try {
    const res = await fetch("/api/fix/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: currentFixSlug }),
    })
    const data = await res.json()

    const gitLog = (data.log || []).join("\n")
    const purgeLog = (data.purge || [])
      .map((p) => `purge ${p.url.split("/").pop()} -> ${p.ok ? "ok" : "failed"}`)
      .join("\n")

    fixLog.textContent = `${gitLog}\n\n${data.message || ""}\n\n${purgeLog}`
  } catch (err) {
    fixLog.textContent = `Error: ${err.message}`
  } finally {
    fixPushBtn.disabled = false
  }
})
