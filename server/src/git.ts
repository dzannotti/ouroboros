import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { exec, run } from './infra/exec.ts'

const git = (dir: string, args: string[]) => run('git', ['-c', 'user.name=Ouroboros', '-c', 'user.email=ouroboros@localhost', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, timeoutMs: 60_000 })

export async function init(dir: string) {
  await git(dir, ['init', '-q', '-b', 'main'])
}

async function heal(dir: string) {
  const lock = path.join(dir, '.git', 'index.lock')
  if (existsSync(lock)) await rm(lock, { force: true })
}

export async function commitAll(dir: string, message: string): Promise<string | null> {
  await heal(dir)
  await git(dir, ['add', '-A'])
  const staged = await exec('git', ['diff', '--cached', '--quiet'], { cwd: dir })
  if (staged.code === 0) return null
  await git(dir, ['commit', '-q', '--no-verify', '-m', message])
  return head(dir)
}

export async function head(dir: string): Promise<string> {
  return (await git(dir, ['rev-parse', 'HEAD'])).trim()
}

export async function log(dir: string, limit = 200): Promise<{ sha: string; title: string; createdAt: string }[]> {
  const out = await git(dir, ['log', `-${limit}`, '--format=%H%x1f%s%x1f%cI'])
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, title, createdAt] = line.split('\x1f')
      return { sha, title, createdAt }
    })
}

export async function restore(dir: string, sha: string, message: string): Promise<string | null> {
  await heal(dir)
  await git(dir, ['read-tree', '--reset', '-u', sha])
  return commitAll(dir, message)
}

export async function changedFiles(dir: string, from: string, to = 'HEAD'): Promise<string[]> {
  return (await git(dir, ['diff', '--name-only', from, to])).split('\n').filter(Boolean)
}

export async function diff(dir: string, sha: string): Promise<string> {
  return git(dir, ['show', '--format=', '--stat', '--patch', sha])
}

export async function archive(dir: string, prefix: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['archive', '--format=zip', `--prefix=${prefix}/`, 'HEAD'], { cwd: dir })
    const chunks: Buffer[] = []
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`git archive failed (${code})`))))
  })
}

export async function show(dir: string, sha: string, file: string): Promise<string> {
  return git(dir, ['show', `${sha}:${file}`])
}
