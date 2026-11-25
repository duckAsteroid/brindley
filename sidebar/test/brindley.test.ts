import { expect, test } from 'claude-code/testing'

import { BrindleyError, parseResult, toCollections, toRawInitiatives } from '../hooks/lib/brindley'

test('checkout as its own block', () => {
  const { data, checkout } = parseResult({
    content: [
      { type: 'text', text: '[{"collection":"atlas"}]' },
      { type: 'text', text: 'Checkout: /r (main)' },
    ],
  })
  expect((data as { collection: string }[])[0]?.collection).toBe('atlas')
  expect(checkout).toBe('/r')
})

test('checkout glued after the JSON', () => {
  const { data, checkout } = parseResult({
    content: [{ type: 'text', text: '{"ref":"atlas#70"}Checkout: /r (main)' }],
  })
  expect((data as { ref: string }).ref).toBe('atlas#70')
  expect(checkout).toBe('/r')
})

test('checkout with no branch runs to the end of the line', () => {
  const { checkout } = parseResult({
    content: [
      { type: 'text', text: '[]' },
      { type: 'text', text: 'Checkout: /r/x' },
    ],
  })
  expect(checkout).toBe('/r/x')
})

test('no checkout line', () => {
  const { data, checkout } = parseResult({ content: [{ type: 'text', text: '[1,2]' }] })
  expect(data).toEqual([1, 2])
  expect(checkout).toBeNull()
})

test('isError throws', () => {
  let caught: unknown
  try {
    parseResult({ content: [{ type: 'text', text: 'Unknown collection' }], isError: true })
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(BrindleyError)
  expect((caught as Error).message).toBe('Unknown collection')
})

test('unparseable JSON throws BrindleyError', () => {
  expect(() => parseResult({ content: [{ type: 'text', text: 'not json' }] })).toThrow()
  let caught: unknown
  try {
    parseResult({ content: [{ type: 'text', text: 'not json' }] })
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(BrindleyError)
})

test('toCollections maps names, paths, aliases and Brindley counts', () => {
  expect(
    toCollections([
      { collection: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: { draft: 2, done: 5, x: 'no' } },
      { collection: 'cbs', path: 'docs/other' },
    ]),
  ).toEqual([
    { name: 'atlas', path: 'docs/initiatives', aliases: ['at'], counts: { draft: 2, done: 5 } },
    { name: 'cbs', path: 'docs/other', aliases: [], counts: {} },
  ])
})

test('toRawInitiatives keeps the list fields used', () => {
  const [raw] = toRawInitiatives([
    {
      ref: 'cbs#1',
      collection: 'cbs',
      number: 1,
      title: 'T',
      type: 'feature',
      status: 'in-progress',
      dimensions: {},
      blockedBy: ['cbs#2'],
      openQuestions: 3,
      path: 'docs/initiatives/01-t.md',
      branch: 'x',
    },
  ])
  expect(raw).toEqual({
    ref: 'cbs#1',
    collection: 'cbs',
    number: 1,
    title: 'T',
    type: 'feature',
    status: 'in-progress',
    dimensions: {},
    blockedBy: ['cbs#2'],
    openQuestions: 3,
    path: 'docs/initiatives/01-t.md',
  })
})

test('a list Brindley 5 wraps with its worktree is read as the list', () => {
  // Brindley 5 adds `worktree` when the repository has other worktrees, so a list
  // arrives as { result: [...], worktree }.
  const { data } = parseResult({
    content: [{ type: 'text', text: '{"result":[{"collection":"ws","path":"docs/initiatives","aliases":["w"]}],"worktree":"."}Checkout: /r (master)' }],
  })
  expect(toCollections(data).map(c => c.name)).toEqual(['ws'])
  expect(toRawInitiatives({ result: [{ ref: 'ws#1', number: 1 }], worktree: '.' }).map(i => i.ref)).toEqual(['ws#1'])
})
