import fs from "fs"
import path from "path"
import sharp from "sharp"

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true })
}

/**
 * Optimizes the raw thumbnail/fullpage/og-image files in workDir and
 * writes them into the asset repo's target directories.
 */
export async function optimizeAndCopy({
    workDir,
    slug,
    thumbnailDir,
    fullpageDir,
    ogImageDir,
    hasOgImage,
    ogImageExt,
}) {
    ensureDir(thumbnailDir)
    ensureDir(fullpageDir)

    const rawThumb = path.join(workDir, "website-thumbnail.png")
    const rawFull = path.join(workDir, "website-fullpage.png")

    const thumbFile = `${slug}-thumbnail.webp`
    const fullFile = `${slug}-fullpage.webp`

    const thumbTarget = path.join(thumbnailDir, thumbFile)
    const fullTarget = path.join(fullpageDir, fullFile)

    await sharp(rawThumb, { limitInputPixels: false })
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(thumbTarget)

    await sharp(rawFull, { limitInputPixels: false })
        .resize({ width: 1600, height: 12000, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(fullTarget)

    const output = { thumbFile, fullFile, thumbTarget, fullTarget, ogFile: null, ogTarget: null }

    if (hasOgImage) {
        ensureDir(ogImageDir)
        const rawOg = path.join(workDir, `og-image.${ogImageExt}`)
        const ogFile = `${slug}-og.webp`
        const ogTarget = path.join(ogImageDir, ogFile)

        await sharp(rawOg, { limitInputPixels: false })
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(ogTarget)

        output.ogFile = ogFile
        output.ogTarget = ogTarget
    }

    return output
}
