import { expect, test } from 'claude-code/testing'

import type { Collection } from '../types'
import type { RawInitiative } from '../hooks/lib/brindley'
import {
  glyphFor,
  isRecognised,
  orderInitiatives,
  rowsFor,
  summarise,
  tierFor,
  toInitiative,
  typeMark,
  type Initiative,
} from '../hooks/lib/model'

const make = (over: Partial<Initiative>): Initiative => ({
  ref: 'x#1',
  displayRef: 'x#1',
  collectionPath: 'docs/x',
  title: 't',
  type: null,
  status: 'draft',
  tier: 'draft',
  priority: null,
  blockedBy: [],
  openQuestions: 0,
  path: 'docs/x/1-t.md',
  updated: null,
  ...over,
})

const refs = (items: Initiative[]) => items.map(i => i.ref)

// Tiers

test('classifies active statuses', () => {
  expect(tierFor('in-progress')).toBe('active')
  expect(tierFor('designed')).toBe('active')
})

test('classifies settled statuses', () => {
  for (const s of ['done', 'deferred', 'abandoned', 'superseded']) expect(tierFor(s)).toBe('settled')
})

test('classifies an unrecognised or missing status as draft, never settled', () => {
  expect(tierFor('draft')).toBe('draft')
  expect(tierFor('wat')).toBe('draft')
  expect(tierFor('')).toBe('draft')
  expect(tierFor(null)).toBe('draft')
})

test('recognises only Brindley core statuses', () => {
  expect(isRecognised('designed')).toBe(true)
  expect(isRecognised('wat')).toBe(false)
  expect(isRecognised(null)).toBe(false)
})

// Glyphs and type marks

test('uses a distinct glyph per status', () => {
  expect(glyphFor(make({ tier: 'active', status: 'in-progress' }))).toBe('▶')
  expect(glyphFor(make({ tier: 'active', status: 'designed' }))).toBe('◆')
  expect(glyphFor(make({ tier: 'draft', status: 'draft' }))).toBe('○')
})

test('marks an unrecognised or missing status with ?', () => {
  expect(glyphFor(make({ status: 'wat' }))).toBe('?')
  expect(glyphFor(make({ status: null }))).toBe('?')
})

test('letters the exceptional types and leaves feature unmarked', () => {
  expect(typeMark('bug')).toBe('b')
  expect(typeMark('spike')).toBe('s')
  expect(typeMark('BUG')).toBe('b')
  expect(typeMark('feature')).toBe(' ')
  expect(typeMark(null)).toBe(' ')
  expect(typeMark('')).toBe(' ')
})

// toInitiative

const raw = (over: Partial<RawInitiative>): RawInitiative => ({
  ref: 'atlas#70',
  collection: 'atlas',
  number: 70,
  title: 'Results go stale',
  type: 'bug',
  status: 'designed',
  dimensions: { priority: { value: 'high' } },
  blockedBy: [],
  openQuestions: 2,
  path: 'docs/initiatives/70-results-go-stale.md',
  ...over,
})

test('toInitiative uses the first alias for displayRef and reads priority', () => {
  const i = toInitiative(raw({}), [{ name: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: {} }], '2026-11-20')
  expect(i.displayRef).toBe('at#70')
  expect(i.priority).toBe('high')
  expect(i.collectionPath).toBe('docs/initiatives')
  expect(i.tier).toBe('active')
  expect(i.updated).toBe('2026-11-20')
  expect(i.openQuestions).toBe(2)
})

test('toInitiative falls back to the name, and to null priority', () => {
  const i = toInitiative(raw({ dimensions: {} }), [{ name: 'atlas', path: 'docs/initiatives', aliases: [], counts: {} }], null)
  expect(i.displayRef).toBe('atlas#70')
  expect(i.priority).toBeNull()
})

test('toInitiative picks the collection by path when two share a name', () => {
  const cs = [
    { name: 'atlas', path: 'docs/initiatives', aliases: ['one'], counts: {} },
    { name: 'atlas', path: 'other/initiatives', aliases: ['two'], counts: {} },
  ]
  const i = toInitiative(raw({ path: 'other/initiatives/sub/70-x.md' }), cs, null)
  expect(i.collectionPath).toBe('other/initiatives')
  expect(i.displayRef).toBe('two#70')
})

test('toInitiative takes blockedBy as strings or refs', () => {
  const i = toInitiative(raw({ blockedBy: ['atlas#2', { ref: 'atlas#3' }] }), [], null)
  expect(i.blockedBy).toEqual(['atlas#2', 'atlas#3'])
})

// Ordering

test('status-recency puts active above draft, newest first within a tier', () => {
  const items = [
    make({ ref: 'a#1', tier: 'draft', updated: '2026-10-20' }),
    make({ ref: 'a#2', tier: 'active', updated: '2026-01-01' }),
    make({ ref: 'a#3', tier: 'active', updated: '2026-10-01' }),
  ]
  expect(refs(orderInitiatives(items, 'status-recency'))).toEqual(['a#3', 'a#2', 'a#1'])
})

test('status-priority orders by priority inside a tier, unscored last', () => {
  const items = [
    make({ ref: 'a#1', tier: 'active', priority: 'low' }),
    make({ ref: 'a#2', tier: 'active', priority: 'critical' }),
    make({ ref: 'a#3', tier: 'active' }),
  ]
  expect(refs(orderInitiatives(items, 'status-priority'))).toEqual(['a#2', 'a#1', 'a#3'])
})

test('recency ignores tier entirely', () => {
  const items = [
    make({ ref: 'a#1', tier: 'active', updated: '2026-01-01' }),
    make({ ref: 'a#2', tier: 'draft', updated: '2026-10-01' }),
  ]
  expect(refs(orderInitiatives(items, 'recency'))).toEqual(['a#2', 'a#1'])
})

test('priority ranks across tiers', () => {
  const items = [
    make({ ref: 'a#1', tier: 'active', priority: 'low' }),
    make({ ref: 'a#2', tier: 'draft', priority: 'critical' }),
  ]
  expect(refs(orderInitiatives(items, 'priority'))).toEqual(['a#2', 'a#1'])
})

test('sorts missing or unparseable updated dates last, ties by ref', () => {
  const items = [
    make({ ref: 'a#1' }),
    make({ ref: 'a#2', updated: 'not-a-date' }),
    make({ ref: 'a#3', updated: '2026-10-01' }),
  ]
  expect(refs(orderInitiatives(items, 'recency'))).toEqual(['a#3', 'a#1', 'a#2'])
})

// Summary

test('summarise takes Brindley counts: active, draft, deferred, done = done + abandoned + superseded', () => {
  const collections: Collection[] = [
    { name: 'a', path: 'a', aliases: [], counts: { 'in-progress': 1, designed: 2, draft: 3, deferred: 4, done: 5, abandoned: 6, superseded: 7 } },
    { name: 'b', path: 'b', aliases: [], counts: { designed: 1, done: 1 } },
  ]
  expect(summarise(collections, [])).toEqual({ active: 4, draft: 3, deferred: 4, done: 19 })
})

test('summarise counts an unrecognised or missing status, which Brindley does not, as draft', () => {
  const collections: Collection[] = [{ name: 'a', path: 'a', aliases: [], counts: { draft: 1 } }]
  const items = [make({ status: 'draft' }), make({ status: 'wat' }), make({ status: null })]
  expect(summarise(collections, items)).toEqual({ active: 0, draft: 3, deferred: 0, done: 0 })
})
// Rows

test('collapsed shows active rows only, at most maxRows', () => {
  const items = [
    ...Array.from({ length: 5 }, (_, n) => make({ ref: `a#${n}`, tier: 'active', status: 'in-progress' })),
    make({ ref: 'b#1', tier: 'draft' }),
  ]
  const rows = rowsFor(items, 'status-recency', 3, false)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.tier === 'active')).toBe(true)
})

test('expanded shows active then draft, uncapped, never settled', () => {
  const items = [
    make({ ref: 'a#2', tier: 'draft' }),
    make({ ref: 'a#1', tier: 'active', status: 'in-progress' }),
    make({ ref: 'a#3', tier: 'settled', status: 'done' }),
    make({ ref: 'a#4', tier: 'draft' }),
  ]
  expect(refs(rowsFor(items, 'status-recency', 1, true))).toEqual(['a#1', 'a#2', 'a#4'])
})
