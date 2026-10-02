import assert from 'node:assert/strict'
import { test } from 'node:test'
import { discoverModels } from './config.ts'

test('discoverModels keeps chat models and falls back to ids for labels', () => {
  const found = discoverModels([{ id: 'big', mode: 'chat' }, { id: 'vec', mode: 'embedding' }, { id: 'rank', mode: 'rerank' }])
  assert.deepEqual(found, { models: [{ id: 'big', label: 'big', description: '' }], defaultId: undefined })
  assert.deepEqual(discoverModels([{ id: 'plain' }, { id: 'text-embedding-3' }]).models.map((m) => m.id), ['plain'])
})

test('discoverModels reads label, description, default and hidden from LiteLLM model_info', () => {
  const found = discoverModels(
    [{ id: 'a', mode: 'chat' }, { id: 'b', mode: 'chat' }, { id: 'c', mode: 'chat' }, { id: 'e' }],
    [
      { model_name: 'a', model_info: { ouroboros: { label: 'Fast', description: 'Quick edits' } } },
      { model_name: 'b', model_info: { ouroboros: { label: ' Best ', default: true } } },
      { model_name: 'c', model_info: { ouroboros: { hidden: true } } },
      { model_name: 'e', model_info: { mode: 'embedding' } },
    ],
  )
  assert.deepEqual(found.models, [
    { id: 'a', label: 'Fast', description: 'Quick edits' },
    { id: 'b', label: 'Best', description: '' },
  ])
  assert.equal(found.defaultId, 'b')
})
