import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const dataDir = await mkdtemp(path.join(tmpdir(), 'ob-test-'))
process.env.DATA_DIR = dataDir
const { inspect, visualEdit } = await import('./visual-edit.ts')
const { tagJsx } = await import('../../template/.ouroboros/plugin.ts')

const source = `export default function Hero() {\n  return (\n    <section className="p-4">\n      <h1 className="text-2xl">Hello</h1>\n      <p>{name}</p>\n      <Button className={cn('a')}>\n        <Play /> Begin\n      </Button>\n      <Button>{running ? 'Pause' : "Start"}</Button>\n    </section>\n  )\n}\n`

async function setup() {
  const dir = path.join(dataDir, 'projects', 'testproj01', 'src')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'Hero.tsx'), source)
  return path.join(dir, 'Hero.tsx')
}

test('tagJsx tags elements with file:line:col', () => {
  const out = tagJsx(source, 'src/Hero.tsx')!
  assert.match(out, /<section data-oid="src\/Hero.tsx:3:5" className="p-4">/)
  assert.match(out, /<h1 data-oid="src\/Hero.tsx:4:7" className="text-2xl">/)
})

test('visualEdit changes text and className by oid', async () => {
  const file = await setup()
  const info = await inspect('testproj01', 'src/Hero.tsx:4:7')
  assert.deepEqual(info.texts.map((t) => t.value), ['Hello'])
  await visualEdit('testproj01', 'src/Hero.tsx:4:7', { texts: [{ id: info.texts[0].id, value: 'Welcome {friends}' }], styles: { fontSize: 'text-4xl', fontWeight: 'font-bold' } })
  const out = await readFile(file, 'utf8')
  assert.match(out, /<h1 className="text-4xl font-bold">\{"Welcome \{friends\}"\}<\/h1>/)
})

test('inspect finds labels next to icons and in conditionals', async () => {
  const file = await setup()
  const icon = await inspect('testproj01', 'src/Hero.tsx:6:7')
  assert.deepEqual(icon.texts.map((t) => t.value), ['Begin'])
  assert.equal(icon.dynamicClass, true)
  await visualEdit('testproj01', 'src/Hero.tsx:6:7', { texts: [{ id: icon.texts[0].id, value: 'Go' }] })
  const cond = await inspect('testproj01', 'src/Hero.tsx:9:7')
  assert.deepEqual(cond.texts.map((t) => t.value), ['Pause', 'Start'])
  await visualEdit('testproj01', 'src/Hero.tsx:9:7', { texts: [{ id: cond.texts[1].id, value: 'Begin' }] })
  const out = await readFile(file, 'utf8')
  assert.match(out, /<Play \/> Go\n/)
  assert.match(out, /\{running \? 'Pause' : "Begin"\}/)
  assert.equal((await inspect('testproj01', 'src/Hero.tsx:5:7')).texts.length, 0)
})

test('applyStyles replaces only the targeted group', async () => {
  const { applyStyles } = await import('../../shared/styles.ts')
  assert.equal(applyStyles('text-2xl text-primary md:text-3xl px-4', { fontSize: 'text-lg', textColor: null, padding: 'p-6' }), 'md:text-3xl text-lg p-6')
})
