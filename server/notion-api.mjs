const NOTION_API = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"

function headers(token) {
    return {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
}

export async function getDatabaseSchema(token, databaseId) {
    const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
        headers: headers(token),
    })
    const data = await res.json()
    if (!res.ok) {
        throw new Error(data.message || `Notion API error (${res.status})`)
    }
    return data.properties // { "Property Name": { type: "...", ... }, ... }
}

function normalizeKey(text) {
    return String(text).toLowerCase().replace(/[\s_-]+/g, "")
}

// Aliases so slightly different naming in Notion still matches our fields.
const KEY_ALIASES = {
    title: ["title", "name"],
    slug: ["slug"],
    hover_description: ["hoverdescription", "hover", "description"],
    category: ["category"],
    subcategory: ["subcategory", "subcat"],
    thumbnail_url: ["thumbnailurl", "thumbnail"],
    fullpage_url: ["fullpageurl", "fullpage"],
    og_image_url: ["ogimageurl", "ogimage", "og"],
    external_link: ["externallink", "url", "link", "website"],
    pricing_type: ["pricingtype", "pricing"],
    is_new: ["isnew", "new"],
    is_sponsored: ["issponsored", "sponsored"],
    meta_description: ["metadescription", "meta"],
    fonts: ["fonts", "font"],
    color_palette: ["colorpalette", "colors", "palette"],
    builder: ["builder"],
    tech_stack: ["techstack", "tech", "stack"],
    added_date: ["addeddate", "date", "added"],
}

function findMatchingPropertyName(fieldKey, schema) {
    const aliases = KEY_ALIASES[fieldKey] || [normalizeKey(fieldKey)]
    const schemaEntries = Object.entries(schema)
    for (const alias of aliases) {
        const match = schemaEntries.find(([name]) => normalizeKey(name) === alias)
        if (match) return match[0]
    }
    return null
}

/**
 * Returns the list of configured option names for a select/multi-select
 * property (e.g. "category" or "subcategory"), matched by our internal
 * field key. Returns [] if the property doesn't exist or isn't a
 * select-type property.
 */
export function getSelectOptions(schema, fieldKey) {
    const propertyName = findMatchingPropertyName(fieldKey, schema)
    if (!propertyName) return []
    const property = schema[propertyName]
    if (property.type === "select") {
        return (property.select?.options || []).map((o) => o.name)
    }
    if (property.type === "multi_select") {
        return (property.multi_select?.options || []).map((o) => o.name)
    }
    return []
}

function buildPropertyValue(type, rawValue) {
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue)

    switch (type) {
        case "title":
            return { title: value ? [{ text: { content: value.slice(0, 2000) } }] : [] }
        case "rich_text":
            return { rich_text: value ? [{ text: { content: value.slice(0, 2000) } }] : [] }
        case "url":
            return { url: value || null }
        case "checkbox":
            return { checkbox: value === "true" || value === "true " }
        case "select":
            return value ? { select: { name: value.slice(0, 100) } } : { select: null }
        case "multi_select":
            return {
                multi_select: value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                    .map((name) => ({ name: name.slice(0, 100) })),
            }
        case "date":
            return value ? { date: { start: value } } : { date: null }
        case "number": {
            const num = Number(value)
            return { number: Number.isFinite(num) ? num : null }
        }
        default:
            return { rich_text: value ? [{ text: { content: value.slice(0, 2000) } }] : [] }
    }
}

/**
 * Maps our internal field list [{ key, value }] onto whatever properties
 * actually exist in the target Notion database, matching by (fuzzy) name.
 * Returns { properties, unmatched } so the caller can warn about fields
 * that had no home in the database.
 */
export function mapFieldsToProperties(fields, schema) {
    const properties = {}
    const unmatched = []

    for (const field of fields) {
        const propertyName = findMatchingPropertyName(field.key, schema)
        if (!propertyName) {
            unmatched.push(field.label)
            continue
        }
        const type = schema[propertyName].type
        properties[propertyName] = buildPropertyValue(type, field.value)
    }

    return { properties, unmatched }
}

export async function createNotionPage(token, databaseId, properties) {
    const res = await fetch(`${NOTION_API}/pages`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
            parent: { database_id: databaseId },
            properties,
        }),
    })
    const data = await res.json()
    if (!res.ok) {
        throw new Error(data.message || `Notion API error (${res.status})`)
    }
    return data
}
