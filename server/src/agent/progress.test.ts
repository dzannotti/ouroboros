import assert from 'node:assert/strict'
import { test } from 'node:test'
import { progressLabel } from './progress.ts'

test('progressLabel falls back until the path has streamed in', () => {
  assert.equal(progressLabel('write_file', ''), 'Writing file')
  assert.equal(progressLabel('write_file', '{"path":"src/Ap'), 'Writing file')
  assert.equal(progressLabel('check_project', '{}'), 'Checking for errors')
  assert.equal(progressLabel('query_database', '{"sql":"select 1"}'), 'query database')
})

test('progressLabel shows the file and how much has been written', () => {
  assert.equal(progressLabel('write_file', '{"path":"src/App.tsx","content":"import x'), 'Writing src/App.tsx')
  assert.equal(progressLabel('write_file', '{"path":"src/App.tsx","content":"a\\nb\\nc'), 'Writing src/App.tsx · 3 lines')
  assert.equal(progressLabel('edit_file', '{"path":"src/App.tsx","old_string":"a\\nb'), 'Editing src/App.tsx')
})
