import { expect, test } from 'claude-code/testing'

import type { Collection } from '../hooks/lib/brindley'
import type { Initiative } from '../hooks/lib/model'
import { applyPin, resolvePinArg } from '../hooks/lib/pin'

const cs: Collection[] = [
  { name: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: {} },
  { name: 'beta', path: 'beta/initiatives', aliases: [], counts: {} },
]

const item = (ref: string, collectionPath: string): Initiative => ({
  ref,
  displayRef: ref,
  collectionPath,
  title: 't',
  type: null,
  status: 'draft',
  tier: 'draft',
  priority: null,
  blockedBy: [],
  openQuestions: 0,
  path: `${collectionPath}/1-t.md`,
  updated: null,
})

const items = [item('atlas#1', 'docs/initiatives'), item('beta#1', 'beta/initiatives')]

test('no pin leaves everything', () => {
  expect(applyPin(cs, items, null)).toEqual({ collections: cs, items })
})

test('a pin that matches no collection is ignored', () => {
  expect(applyPin(cs, items, 'gone/initiatives')).toEqual({ collections: cs, items })
})

test('a pin keeps that collection and its initiatives', () => {
  const pinned = applyPin(cs, items, 'docs/initiatives')
  expect(pinned.collections).toEqual([cs[0]])
  expect(pinned.items.map(i => i.ref)).toEqual(['atlas#1'])
})

test('all clears the pin', () => {
  expect(resolvePinArg('all', cs)).toEqual({ pin: null })
  expect(resolvePinArg(' All ', cs)).toEqual({ pin: null })
})

test('a pin arg can be a path, a name, an alias or a 1-based index', () => {
  expect(resolvePinArg('beta/initiatives', cs)).toEqual({ pin: 'beta/initiatives' })
  expect(resolvePinArg('beta', cs)).toEqual({ pin: 'beta/initiatives' })
  expect(resolvePinArg('at', cs)).toEqual({ pin: 'docs/initiatives' })
  expect(resolvePinArg('2', cs)).toEqual({ pin: 'beta/initiatives' })
})

test('a name two collections share is ambiguous', () => {
  const twins: Collection[] = [...cs, { name: 'atlas', path: 'other/initiatives', aliases: [], counts: {} }]
  const result = resolvePinArg('atlas', twins)
  expect('error' in result).toBe(true)
  const error = (result as { error: string }).error
  expect(error).toContain('docs/initiatives')
  expect(error).toContain('other/initiatives')
})

test('an unknown arg or index out of range is an error', () => {
  expect('error' in resolvePinArg('nope', cs)).toBe(true)
  expect('error' in resolvePinArg('3', cs)).toBe(true)
  expect('error' in resolvePinArg('0', cs)).toBe(true)
})
