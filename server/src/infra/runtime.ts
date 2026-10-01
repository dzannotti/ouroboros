import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { config } from '../config.ts'
import { exec, run } from './exec.ts'

const which = (bin: string) => (process.env.PATH ?? '').split(':').some((dir) => existsSync(path.join(dir, bin)))

/** Container CLI: podman locally (rootless), docker on deployment hosts. Both speak the same subset we use. */
export const cli = (process.env.CONTAINER_CLI ?? (which('podman') ? 'podman' : 'docker')) as 'podman' | 'docker'

/** When set, Ouroboros runs in a container on this network and reaches sibling containers by name instead of published ports. */
export const sharedNetwork = process.env.CONTAINER_NETWORK || undefined

export const container = (args: string[], opts?: { timeoutMs?: number; input?: string }) => run(cli, args, opts)
export const containerExec = (args: string[], opts?: Parameters<typeof exec>[2]) => exec(cli, args, opts)

/** Bind-mount source as seen by the container daemon (differs when Ouroboros itself runs in a container). */
export function hostPath(p: string): string {
  const hostData = process.env.HOST_DATA_DIR
  if (!hostData || !p.startsWith(config.dataDir)) return p
  return path.join(hostData, path.relative(config.dataDir, p))
}

/** SELinux relabel suffix for bind mounts; docker ignores it on hosts without SELinux. */
export const relabel = (shared: boolean) => (shared ? 'z' : 'Z')

export async function isRunning(name: string) {
  return (await containerExec(['container', 'inspect', '-f', '{{.State.Running}}', name])).stdout.trim() === 'true'
}

export async function exists(name: string) {
  return (await containerExec(['container', 'inspect', name])).code === 0
}

export async function ensureNetwork(name: string, labels: string[] = []) {
  if ((await containerExec(['network', 'inspect', name])).code === 0) return
  await container(['network', 'create', ...labels.flatMap((l) => ['--label', l]), name])
}

/** Args that make a container reachable from Ouroboros: shared network in container mode, else a localhost-published port. */
export function reachability(port: number): string[] {
  return sharedNetwork ? ['--network', sharedNetwork] : ['-p', `127.0.0.1::${port}`]
}

/** Base URL to reach `name:port` from the Ouroboros process. */
export async function address(name: string, port: number): Promise<string> {
  if (sharedNetwork) return `http://${name}:${port}`
  const mapped = (await container(['port', name, String(port)])).trim().split('\n')[0]
  return `http://127.0.0.1:${Number(mapped.split(':').pop())}`
}

/** URL containers use to reach the Ouroboros preview/backend gateway. */
export function gatewayFromContainers(): string {
  if (process.env.GATEWAY_INTERNAL_URL) return process.env.GATEWAY_INTERNAL_URL.replace(/\/$/, '')
  if (sharedNetwork) return `http://${process.env.OUROBOROS_HOSTNAME ?? os.hostname()}:${config.previewPort}`
  return `http://${cli === 'podman' ? 'host.containers.internal' : 'host.docker.internal'}:${config.previewPort}`
}

/** Extra args so `host.docker.internal` resolves under docker (podman provides host.containers.internal itself). */
export const hostGatewayArgs = () => (cli === 'docker' && !sharedNetwork ? ['--add-host', 'host.docker.internal:host-gateway'] : [])

export async function ensureImage(image: string, containerfile: string, contextDir: string) {
  if ((await containerExec(['image', 'inspect', image])).code === 0) return
  console.log(`[runtime] building ${image} with ${cli} (first run only)…`)
  await run(cli, ['build', '-t', image, '-f', containerfile, contextDir], { timeoutMs: 30 * 60_000 })
}
