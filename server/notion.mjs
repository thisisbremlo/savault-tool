/**
 * Builds the structured field list used to populate the Notion database.
 * Returned as an array of { label, key, value } so the frontend can render
 * one field at a time with its own copy button, instead of a single
 * flattened clipboard blob.
 */
export function buildNotionFields({
    title,
    slug,
    hoverDescription,
    metaDescription,
    thumbnailUrl,
    fullpageUrl,
    ogImageUrl,
    externalLink,
    category,
    subcategory,
    pricingType,
    isNew,
    isSponsored,
    analysis,
    addedDate,
}) {
    return [
        { label: "Title", key: "title", value: title },
        { label: "Slug", key: "slug", value: slug },
        { label: "Hover description", key: "hover_description", value: hoverDescription },
        { label: "Category", key: "category", value: category || "" },
        { label: "Subcategory", key: "subcategory", value: subcategory || "" },
        { label: "Thumbnail URL", key: "thumbnail_url", value: thumbnailUrl },
        { label: "Fullpage URL", key: "fullpage_url", value: fullpageUrl },
        { label: "OG image URL", key: "og_image_url", value: ogImageUrl || "" },
        { label: "External link", key: "external_link", value: externalLink },
        { label: "Pricing type", key: "pricing_type", value: pricingType || "" },
        { label: "Is new", key: "is_new", value: isNew ? "true" : "false" },
        { label: "Is sponsored", key: "is_sponsored", value: isSponsored ? "true" : "false" },
        { label: "Meta description", key: "meta_description", value: metaDescription },
        { label: "Fonts", key: "fonts", value: (analysis?.fonts || []).join(", ") },
        { label: "Color palette", key: "color_palette", value: (analysis?.colorPalette || []).join(", ") },
        { label: "Builder", key: "builder", value: analysis?.builder || "" },
        { label: "Tech stack", key: "tech_stack", value: (analysis?.techStack || []).join(", ") },
        { label: "Added date", key: "added_date", value: addedDate },
    ]
}

