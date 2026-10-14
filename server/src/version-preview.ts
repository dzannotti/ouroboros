import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { projectDir } from './config.ts'
import { exec } from './infra/exec.ts'
import * as sandbox from './sandbox.ts'

const building = new Map<string, Promise<void>>()

export const versionDist = (id: string, sha: string) => path.join(projectDir(id), '.ouroboros-versions', sha, 'dist')

async function checkout(id: string, sha: string): Promise<string> {
  const dir = path.join(projectDir(id), '.ouroboros-versions', sha)
  if (existsSync(path.join(dir, 'package.json'))) return dir
  await rm(dir, { recursive: true, force: true })
  await exec('git', ['worktree', 'prune'], { cwd: projectDir(id) })
  const add = await exec('git', ['worktree', 'add', '--detach', '-f', dir, sha], { cwd: projectDir(id) })
  if (add.code !== 0) throw new Error(add.stderr || 'Could not check out version')
  return dir
}

const once = (key: string, job: () => Promise<void>): Promise<void> => {
  const existing = building.get(key)
  if (existing) return existing
  const run = job().finally(() => building.delete(key))
  building.set(key, run)
  return run
}

async function viteBuild(id: string, sha: string, env: Record<string, string>, outDir: string) {
  const vars = Object.entries(env)
    .map(([k, v]) => `${k}='${v.replace(/'/g, `'\\''`)}'`)
    .join(' ')
  const res = await sandbox.execIn(id, `cd .ouroboros-versions/${sha} && ln -sfn /app/node_modules node_modules && ${vars} pnpm exec vite build --outDir ${outDir} --emptyOutDir --logLevel error`, { timeoutMs: 180_000 })
  if (res.code !== 0) throw new Error(`Building this version failed:\n${(res.stderr || res.stdout).slice(-1500)}`)
}

export function buildVersion(id: string, sha: string): Promise<void> {
  if (existsSync(path.join(versionDist(id, sha), 'index.html'))) return Promise.resolve()
  return once(`${id}:${sha}`, async () => {
    await checkout(id, sha)
    await viteBuild(id, sha, { OUROBOROS_BASE: `/v/${id}/${sha}/` }, 'dist')
  })
}

/** Production build of a version for publishing: served from the site root, pointed at the given backend. Returns the output folder. */
export async function buildRelease(id: string, sha: string, env: Record<string, string>): Promise<string> {
  const dir = await checkout(id, sha)
  await once(`${id}:${sha}:release`, () => viteBuild(id, sha, { OUROBOROS_BASE: '/', ...env }, 'dist-release'))
  return path.join(dir, 'dist-release')
}

export const versionSource = (id: string, sha: string) => checkout(id, sha)
