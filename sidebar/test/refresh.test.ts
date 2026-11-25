import { expect, test } from 'claude-code/testing'

import type { Load } from '../types'
import { closedMarkKey, serverToolPrefix, shouldRefresh } from '../hooks/lib/refresh'

const p = 'mcp__brindley__'
const paths = ['docs/initiatives']

test('serverToolPrefix normalises the server name as the engine names tools', () => {
  expect(serverToolPrefix('brindley')).toBe('mcp__brindley__')
  expect(serverToolPrefix('plugin:x:brindley')).toBe('mcp__plugin_x_brindley__')
  expect(serverToolPrefix('plugin:brindley:core')).toBe('mcp__plugin_brindley_core__')
})

test('any tool of the Brindley server refreshes', () => {
  expect(shouldRefresh('mcp__brindley__update', {}, p, '/r', [])).toBe(true)
  expect(shouldRefresh('mcp__other__update', {}, p, '/r', paths)).toBe(false)
})

test('an edit under a collection refreshes', () => {
  expect(shouldRefresh('Edit', { file_path: '/r/docs/initiatives/1-a.md' }, p, '/r', paths)).toBe(true)
  expect(shouldRefresh('Write', { file_path: '/r/docs/initiatives/sub/2-b.md' }, p, '/r', paths)).toBe(true)
  expect(shouldRefresh('NotebookEdit', { notebook_path: '/r/docs/initiatives/n.ipynb' }, p, '/r', paths)).toBe(true)
  expect(shouldRefresh('Edit', { file_path: 'docs/initiatives/1-a.md' }, p, '/r', paths)).toBe(true)
})

test('an edit elsewhere, or another tool, does not', () => {
  expect(shouldRefresh('Edit', { file_path: '/r/src/x.ts' }, p, '/r', paths)).toBe(false)
  expect(shouldRefresh('Edit', { file_path: '/r/docs/initiatives-old/1.md' }, p, '/r', paths)).toBe(false)
  expect(shouldRefresh('Edit', { file_path: '/elsewhere/docs/initiatives/1.md' }, p, '/r', paths)).toBe(false)
  expect(shouldRefresh('Edit', {}, p, '/r', paths)).toBe(false)
  expect(shouldRefresh('Bash', { command: 'ls' }, p, '/r', paths)).toBe(false)
})

const OK: Load = { kind: 'ok', snapshot: { checkout: '/r', collections: [], initiatives: [] } }

test('only the person closing the pane marks the project closed', () => {
  expect(closedMarkKey('person', OK)).toBe('closed:/r')
  expect(closedMarkKey('plugin', OK)).toBeNull()
  expect(closedMarkKey('unload', OK)).toBeNull()
  expect(closedMarkKey('person', null)).toBeNull()
  expect(closedMarkKey('person', { kind: 'none', reason: 'x' })).toBeNull()
})
