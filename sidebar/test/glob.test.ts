import { expect, test } from 'claude-code/testing'

import { globToRegExp, isExcluded } from '../hooks/lib/glob'

test('**/x/** matches x at any depth', () => {
  expect(isExcluded('test/fixtures/repo/test-corpus/initiatives', ['**/test-corpus/**'])).toBe(true)
  expect(isExcluded('test-corpus/initiatives', ['**/test-corpus/**'])).toBe(true)
  expect(isExcluded('docs/initiatives', ['**/test-corpus/**'])).toBe(false)
})

test('a trailing ** matches the rest', () => {
  expect(isExcluded('archive/old', ['archive/**'])).toBe(true)
  expect(isExcluded('archived/old', ['archive/**'])).toBe(false)
})

test('* stays within a segment', () => {
  expect(globToRegExp('a/*/c').test('a/b/c')).toBe(true)
  expect(globToRegExp('a/*/c').test('a/b/x/c')).toBe(false)
})

test('? matches one character and not /', () => {
  expect(globToRegExp('a?c').test('abc')).toBe(true)
  expect(globToRegExp('a?c').test('ac')).toBe(false)
  expect(globToRegExp('a?c').test('a/c')).toBe(false)
})

test('other characters are literal', () => {
  expect(globToRegExp('a.b+(c)').test('a.b+(c)')).toBe(true)
  expect(globToRegExp('a.b').test('axb')).toBe(false)
})

test('no globs excludes nothing', () => {
  expect(isExcluded('docs/initiatives', [])).toBe(false)
})

test('a trailing /** also matches the folder itself', () => {
  expect(isExcluded('fixtures/test-corpus', ['**/test-corpus/**'])).toBe(true)
  expect(isExcluded('archive', ['archive/**'])).toBe(true)
})
