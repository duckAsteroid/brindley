// Text helpers: front-matter `updated`, the goal paragraph, the work prompt, truncation.

/** The front-matter `updated:` value, unquoted; null when there is none. */
export function updatedOf(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n] as string
    if (line.trim() === '---') return null
    const match = /^updated:\s*(.*)$/.exec(line)
    if (match) {
      const value = (match[1] as string).trim().replace(/^(['"])(.*)\1$/, '$2').trim()
      return value || null
    }
  }
  return null
}

function sectionLines(body: string, heading: string): string[] {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex(line => line.trim().toLowerCase() === `## ${heading}`)
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => line.startsWith('## '))
  return end === -1 ? rest : rest.slice(0, end)
}

/** The first paragraph under `## Goal`. */
export function goalOf(body: string): string {
  const paragraph: string[] = []
  for (const line of sectionLines(body, 'goal')) {
    if (line.trim() === '') {
      if (paragraph.length > 0) break
      continue
    }
    paragraph.push(line.trim())
  }
  return paragraph.join('\n')
}

export function queueText(i: { displayRef: string; title: string; path: string }): string {
  return `Work on ${i.displayRef} — ${i.title}. Read ${i.path} first.`
}

/** Cuts to `columns` characters, the last one `…` when it was longer. */
export function truncate(text: string, columns: number): string {
  const chars = Array.from(text)
  if (chars.length <= columns) return text
  if (columns <= 0) return ''
  return chars.slice(0, columns - 1).join('') + '…'
}
