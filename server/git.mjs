import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"

export function checkAssetRepo(assetRepoDir) {
    if (!fs.existsSync(assetRepoDir)) {
        return { ok: false, message: `Asset repo folder not found: ${assetRepoDir}` }
    }
    if (!fs.existsSync(path.join(assetRepoDir, ".git"))) {
        return { ok: false, message: `Asset repo folder is not a Git repository: ${assetRepoDir}` }
    }
    return { ok: true }
}

export function pushAssets(assetRepoDir, commitMessage) {
    const log = []

    const add = spawnSync("git", ["add", "."], { cwd: assetRepoDir })
    log.push(`git add . -> exit ${add.status}`)
    if (add.status !== 0) {
        return { ok: false, log, message: "git add failed" }
    }

    const commit = spawnSync("git", ["commit", "-m", commitMessage], { cwd: assetRepoDir })
    log.push(`git commit -> exit ${commit.status}`)
    if (commit.status !== 0) {
        log.push(commit.stdout?.toString() || "")
        log.push(commit.stderr?.toString() || "")
        // Non-fatal: could just mean nothing to commit
    }

    let push = spawnSync("git", ["push"], { cwd: assetRepoDir })
    log.push(`git push -> exit ${push.status}`)

    if (push.status !== 0) {
        const pushError = push.stderr?.toString() || ""
        const isFastForwardRejection = /rejected|fetch first|non-fast-forward/i.test(pushError)

        if (isFastForwardRejection) {
            log.push("Remote has changes we don't have locally — running git pull --rebase…")
            const pull = spawnSync("git", ["pull", "--rebase"], { cwd: assetRepoDir })
            log.push(`git pull --rebase -> exit ${pull.status}`)
            log.push(pull.stdout?.toString() || "")
            log.push(pull.stderr?.toString() || "")

            if (pull.status !== 0) {
                return {
                    ok: false,
                    log,
                    message:
                        "git pull --rebase failed, likely a merge conflict. Resolve it manually in the asset repo, then push again.",
                }
            }

            push = spawnSync("git", ["push"], { cwd: assetRepoDir })
            log.push(`git push (retry) -> exit ${push.status}`)
        }

        if (push.status !== 0) {
            log.push(push.stdout?.toString() || "")
            log.push(push.stderr?.toString() || "")
            return { ok: false, log, message: "git push failed" }
        }
    }

    return { ok: true, log, message: "Assets pushed to GitHub." }
}
