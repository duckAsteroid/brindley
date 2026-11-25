import { expect, test } from 'claude-code/testing'

import { resolveOptions } from '../hooks/lib/options'

const DEFAULTS = { order: 'status-recency', exclude: ['**/test-corpus/**'], maxRows: 8, server: 'plugin:brindley:core' }

test('missing options take the defaults', () => {
  expect(resolveOptions({})).toEqual(DEFAULTS)
  expect(resolveOptions(undefined)).toEqual(DEFAULTS)
})

test('invalid options take the defaults', () => {
  const o = resolveOptions({ order: 'nope', maxRows: -1, server: '', exclude: 'x' })
  expect(o.order).toBe('status-recency')
  expect(o.maxRows).toBe(8)
  expect(o.server).toBe('plugin:brindley:core')
  expect(o.exclude).toEqual(['**/test-corpus/**'])
})

test('valid options are kept', () => {
  expect(resolveOptions({ order: 'priority', maxRows: 3.7, server: 'plugin:x:brindley', exclude: ['a/**', 4] })).toEqual({
    order: 'priority',
    exclude: ['a/**'],
    maxRows: 3,
    server: 'plugin:x:brindley',
  })
})
