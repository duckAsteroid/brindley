import { expect, test } from 'claude-code/testing'

import { goalOf, queueText, truncate, updatedOf } from '../hooks/lib/text'

test('updatedOf reads the front-matter value, quoted or not', () => {
  expect(updatedOf('---\ntype: x\nupdated: 2026-11-20\n---\n# T')).toBe('2026-11-20')
  expect(updatedOf('---\nupdated: "2026-11-20"\n---\n# T')).toBe('2026-11-20')
  expect(updatedOf("---\nupdated: '2026-11-20'\n---\n# T")).toBe('2026-11-20')
  expect(updatedOf('---\r\nupdated: 2026-11-20\r\n---\r\n# T')).toBe('2026-11-20')
})

test('updatedOf gives null without front-matter or without the field', () => {
  expect(updatedOf('# no front-matter')).toBeNull()
  expect(updatedOf('---\ntype: x\n---\n# T')).toBeNull()
  expect(updatedOf('---\ntype: x\n---\nupdated: 2026-11-20\n')).toBeNull()
  expect(updatedOf('---\nupdated:\n---\n')).toBeNull()
})

test('goalOf gives the first paragraph under ## Goal', () => {
  expect(goalOf('## Goal\n\nFirst para\nline two\n\nSecond')).toBe('First para\nline two')
  expect(goalOf('# T\n\n## goal\nOnly\n## Next\nNo')).toBe('Only')
  expect(goalOf('# T\n\n## Design\nx')).toBe('')
})

test('queueText is the work prompt', () => {
  expect(queueText({ displayRef: 'at#70', title: 'Results go stale', path: 'docs/initiatives/70-x.md' })).toBe(
    'Work on at#70 — Results go stale. Read docs/initiatives/70-x.md first.',
  )
})

test('truncate cuts to the columns with a trailing …', () => {
  expect(truncate('abcdef', 4)).toBe('abc…')
  expect(truncate('abc', 4)).toBe('abc')
  expect(truncate('abcd', 4)).toBe('abcd')
  expect(truncate('abc', 1)).toBe('…')
  expect(truncate('abc', 0)).toBe('')
})
