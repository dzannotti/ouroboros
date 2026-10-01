import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import path from 'node:path'
import type { SandboxStatus } from '../../shared/types.ts'
import { config, projectDir } from './config.ts'
import { publish } from './events.ts'
import type { ExecResult } from './infra/exec.ts'
import { address, cli, container, containerExec, hostPath, isRunning, reachability, relabel } from './infra/runtime.ts'

const DEV_PORT = 5173
const POLL = (() => {
  try {
    return Number(readFileSync('/proc/sys/fs/inotify/max_user_instances', 'utf8')) < 1024
  } catch {
    return false
  }
})()
const LOG_LINES = 300

type LogEntry = { at: number; source: 'dev' | 'browser'; level: string; message: string }

type Box = {
  status: SandboxStatus
  error?: string
  url?: string
  dev?: ChildProcess
  logs: LogEntry[]
  lastActive: number
  busy: number
  starting?: Promise<void>
}

const boxes = new Map<string, Box>()
const containerName = (id: string) => `ob-${id}`

function box(id: string): Box {
  let b = boxes.get(id)
  if (!b) {
    b = { status: 'stopped', logs: [], lastActive: Date.now(), busy: 0 }
    boxes.set(id, b)
  }
  return b
}

function setStatus(id: string, status: SandboxStatus, error?: string) {
  const b = box(id)
  b.status = status
  b.error = error
  publish(id, { type: 'sandbox', status, error })
}

export function pushLog(id: string, entry: Omit<LogEntry, 'at'>) {
  const b = box(id)
  const at = Date.now()
  b.logs.push({ ...entry, at })
  if (entry.source === 'dev') publish(id, { type: 'log', ...entry, at })
  if (b.logs.length > LOG_LINES) b.logs.splice(0, b.logs.length - LOG_LINES)
}

export const status = (id: string) => ({ status: box(id).status, error: box(id).error })
export const logs = (id: string) => box(id).logs
export const url = (id: string) => box(id).url
export const touch = (id: string) => void (box(id).lastActive = Date.now())

export function clearLogs(id: string) {
  box(id).logs = []
}

async function ensureContainer(id: string) {
  const name = containerName(id)
  const inspect = await containerExec(['container', 'inspect', '-f', '{{.State.Running}}', name])
  if (inspect.code !== 0) {
    await container([
      'run', '-d', '--init', '--name', name,
      '--label', 'ouroboros.project=' + id,
      '--memory', '3g', '--cpus', '2',
      '-v', `${hostPath(projectDir(id))}:/app:${relabel(false)}`,
      '-v', 'ouroboros-pnpm:/pnpm-store',
      ...reachability(DEV_PORT),
      '-e', `OUROBOROS_BASE=/p/${id}/`,
      config.sandboxImage,
    ])
  } else if (!(await isRunning(name))) {
    await container(['start', name])
  }
  box(id).url = await address(name, DEV_PORT)
}

export async function install(id: string, signal?: AbortSignal): Promise<ExecResult> {
  const offline = await execIn(id, 'pnpm install --offline', { timeoutMs: 180_000, signal })
  if (offline.code === 0) return offline
  pushLog(id, { source: 'dev', level: 'info', message: 'Installing dependencies from the network…' })
  const res = await execIn(id, 'pnpm install', { timeoutMs: 300_000, signal })
  for (const line of (res.stdout + res.stderr).split('\n').filter((l) => l.trim()).slice(-15)) pushLog(id, { source: 'dev', level: res.code === 0 ? 'info' : 'error', message: line })
  return res
}

async function startDev(id: string) {
  const b = box(id)
  b.dev?.kill('SIGKILL')
  await containerExec(['exec', containerName(id), 'sh', '-c', 'pkill -f "vite" || true'])
  const dev = spawn(cli, ['exec', '-i', '-w', '/app', ...(POLL ? ['-e', 'OUROBOROS_POLL=1'] : []), containerName(id), 'sh', '-c', `exec pnpm exec vite --port ${DEV_PORT} --strictPort --clearScreen false`])
  b.dev = dev
  const onData = (level: string) => (d: Buffer) => {
    for (const line of d.toString().split('\n')) if (line.trim()) pushLog(id, { source: 'dev', level, message: line.replace(/\x1b\[[0-9;]*m/g, '') })
  }
  dev.stdout?.on('data', onData('info'))
  dev.stderr?.on('data', onData('error'))
  dev.on('exit', (code) => {
    if (b.dev !== dev) return
    b.dev = undefined
    if (b.status === 'ready') setStatus(id, 'error', `Dev server exited (${code})`)
  })
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${b.url}/p/${id}/`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    if (!b.dev) break
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Dev server failed to start:\n${b.logs.slice(-20).map((l) => l.message).join('\n')}`)
}

export function ensure(id: string): Promise<void> {
  const b = box(id)
  touch(id)
  if (b.status === 'ready' && b.dev) return Promise.resolve()
  if (b.starting) return b.starting
  b.starting = (async () => {
    try {
      setStatus(id, 'starting')
      pushLog(id, { source: 'dev', level: 'info', message: 'Starting sandbox…' })
      await cp(path.join(config.templateDir, '.ouroboros'), path.join(projectDir(id), '.ouroboros'), { recursive: true, force: true })
      await ensureContainer(id)
      if (!existsSync(path.join(projectDir(id), 'node_modules', '.modules.yaml'))) {
        setStatus(id, 'installing')
        const res = await install(id)
        if (res.code !== 0) throw new Error(`Installing dependencies failed:\n${(res.stderr || res.stdout).slice(-2000)}`)
      }
      await startDev(id)
      setStatus(id, 'ready')
    } catch (err) {
      setStatus(id, 'error', (err as Error).message)
      throw err
    } finally {
      b.starting = undefined
    }
  })()
  return b.starting
}

export async function restartDev(id: string) {
  const b = box(id)
  if (b.starting) await b.starting
  b.dev?.kill('SIGKILL')
  b.dev = undefined
  b.status = 'stopped'
  await ensure(id)
}

export async function execIn(id: string, command: string, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ExecResult> {
  const b = box(id)
  b.busy++
  try {
    if (!b.url) await ensureContainer(id)
    return await containerExec(['exec', '-w', '/app', containerName(id), 'sh', '-c', command], { timeoutMs: opts.timeoutMs ?? 120_000, signal: opts.signal })
  } finally {
    b.busy--
    touch(id)
  }
}

export async function stop(id: string) {
  const b = box(id)
  b.dev?.kill('SIGKILL')
  b.dev = undefined
  b.url = undefined
  await containerExec(['stop', '-t', '2', containerName(id)])
  setStatus(id, 'stopped')
}

export async function remove(id: string) {
  await stop(id)
  await containerExec(['rm', '-f', containerName(id)])
  boxes.delete(id)
}

export function startReaper(isBusy: (id: string) => boolean) {
  setInterval(() => {
    const cutoff = Date.now() - config.sandboxIdleMinutes * 60_000
    for (const [id, b] of boxes) {
      if (b.status !== 'stopped' && !b.starting && b.busy === 0 && b.lastActive < cutoff && !isBusy(id)) void stop(id)
    }
  }, 60_000).unref()
}
