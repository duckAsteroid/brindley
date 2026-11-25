// A small glob matcher for collection paths: *, ** and ?. No npm dependency.

export function globToRegExp(glob: string): RegExp {
  let out = ''
  let i = 0
  while (i < glob.length) {
    if (glob.startsWith('/**', i) && i + 3 === glob.length) {
      // A trailing /** matches the folder itself and everything under it.
      out += '(?:/.*)?'
      i += 3
    } else if (glob.startsWith('**/', i)) {
      out += '(?:[^/]+/)*'
      i += 3
    } else if (glob.startsWith('**', i) && i + 2 === glob.length) {
      out += '.*'
      i += 2
    } else if (glob[i] === '*') {
      out += '[^/]*'
      i += 1
    } else if (glob[i] === '?') {
      out += '[^/]'
      i += 1
    } else {
      out += (glob[i] as string).replace(/[.+^${}()|[\]\\]/g, '\\$&')
      i += 1
    }
  }
  return new RegExp(`^${out}$`)
}

export function isExcluded(path: string, globs: readonly string[]): boolean {
  return globs.some(glob => globToRegExp(glob).test(path))
}
