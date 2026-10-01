import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { projectDir } from './config.ts'
import { exec } from './infra/exec.ts'
import * as sandbox from './sandbox.ts'

const building = new Map<string, Promise<void>>()

export const versionDist = (id: string, sha: string) => path.join(projectDir(id), '.ouroboros-versions', sha, 'dist')

export function buildVersion(id: string, sha: string): Promise<void> {
  if (existsSync(path.join(versionDist(id, sha), 'index.html'))) return Promise.resolve()
  const key = `${id}:${sha}`
  const existing = building.get(key)
  if (existing) return existing
  const job = (async () => {
    const dir = path.join(projectDir(id), '.ouroboros-versions', sha)
    await rm(dir, { recursive: true, force: true })
    await exec('git', ['worktree', 'prune'], { cwd: projectDir(id) })
    const add = await exec('git', ['worktree', 'add', '--detach', '-f', dir, sha], { cwd: projectDir(id) })
    if (add.code !== 0) throw new Error(add.stderr || 'Could not check out version')
    const rel = `.ouroboros-versions/${sha}`
    const res = await sandbox.execIn(id, `cd ${rel} && ln -sfn /app/node_modules node_modules && OUROBOROS_BASE=/v/${id}/${sha}/ pnpm exec vite build --logLevel error`, { timeoutMs: 180_000 })
    if (res.code !== 0) throw new Error(`Building this version failed:\n${(res.stderr || res.stdout).slice(-1500)}`)
  })().finally(() => building.delete(key))
  building.set(key, job)
  return job
}
