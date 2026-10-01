import { spawn } from 'node:child_process'

export class ExecError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message)
  }
}

export type ExecResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

export function exec(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; input?: string; signal?: AbortSignal } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'], signal: opts.signal })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, opts.timeoutMs)
      : undefined
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
    child.stdin.end(opts.input ?? '')
  })
}

export async function run(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; input?: string } = {}): Promise<string> {
  const res = await exec(cmd, args, opts)
  if (res.code !== 0) throw new ExecError(`${cmd} ${args.join(' ')} failed (${res.code}): ${res.stderr.trim() || res.stdout.trim()}`, res.code, res.stdout, res.stderr)
  return res.stdout
}

