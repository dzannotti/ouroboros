import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bareImports, fixAssetStrings, fixLucideImports, levenshtein } from './fixers.ts'

const names = new Set(['Home', 'HomeIcon', 'ChartBar', 'Settings', 'ArrowRight', 'Mail'])

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3)
  assert.equal(levenshtein('', 'abc'), 3)
  assert.equal(levenshtein('same', 'same'), 0)
})

test('fixLucideImports keeps valid icons untouched', async () => {
  const code = `import { Home, Mail } from 'lucide-react'\n<Home />`
  assert.deepEqual(await fixLucideImports(code, names), { code, fixes: [] })
})

test('fixLucideImports aliases unknown icons to nearest real icon', async () => {
  const code = `import { Hom, settings, ArrowRigth as Next } from "lucide-react"\nconst x = <Hom />`
  const { code: out, fixes } = await fixLucideImports(code, names)
  assert.match(out, /import \{ Home as Hom, Settings as settings, ArrowRight as Next \} from 'lucide-react'/)
  assert.match(out, /const x = <Hom \/>/)
  assert.equal(fixes.length, 3)
})

test('bareImports finds packages, ignores local and builtin', () => {
  const code = `import a from 'react'\nimport { b } from '@tanstack/react-query/foo'\nimport c from './c'\nimport '@/x.css'\nimport fs from 'node:fs'\nimport path from 'path'\nconst d = await import('zod')\nexport { e } from 'framer-motion'`
  assert.deepEqual(bareImports(code).sort(), ['@tanstack/react-query', 'framer-motion', 'react', 'zod'])
})

test('fixAssetStrings turns alias string paths into imports', () => {
  const code = `import { Card } from '@/components/ui/card'\nexport const books = [{ cover: "@/assets/book1.jpg" }, { cover: '@/assets/book-two.png' }]\nexport const Hero = () => <img src="/src/assets/hero.jpg" alt="" />\n`
  const { code: out, fixes } = fixAssetStrings(code)
  assert.match(out, /import book1Img from '@\/assets\/book1.jpg'/)
  assert.match(out, /import bookTwoImg from '@\/assets\/book-two.png'/)
  assert.match(out, /import heroImg from '@\/assets\/hero.jpg'/)
  assert.match(out, /cover: book1Img/)
  assert.match(out, /<img src=\{heroImg\} alt="" \/>/)
  assert.equal(fixes.length, 3)
})

test('fixAssetStrings leaves real imports alone and reuses them', () => {
  const code = `import hero from '@/assets/hero.jpg'\nconst x = { src: '@/assets/hero.jpg' }\n`
  const { code: out } = fixAssetStrings(code)
  assert.match(out, /const x = \{ src: hero \}/)
  assert.equal(out.match(/import hero from/g)?.length, 1)
})
