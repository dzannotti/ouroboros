import assert from 'node:assert/strict'
import { test } from 'node:test'
import { config, models } from './config.ts'
import { liveModel } from './projects.ts'

test('a project whose model was retired moves to the default model', () => {
  models.splice(0, models.length, { id: 'new-a', label: 'A', description: '' }, { id: 'new-b', label: 'B', description: '' })
  assert.equal(liveModel('new-b'), 'new-b')
  assert.equal(liveModel('retired-model'), 'new-a')
  process.env.AI_DEFAULT_MODEL = 'new-b'
  assert.equal(liveModel('retired-model'), 'new-b')
  process.env.AI_DEFAULT_MODEL = 'also-retired'
  assert.equal(config.ai.defaultModel, 'new-a')
})
