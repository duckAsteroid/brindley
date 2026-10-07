---
type: feature
status: draft
updated: 2026-10-07
---
# Record why an initiative was abandoned

## Goal

An abandoned initiative says nothing about why: `set_status` takes no reason, the README's Closed list shows only "(abandoned)" (src/readme.ts:155), and FORMAT says nothing about the body of abandoned work, unlike `done` (§7). Make the reason visible where a reader lands — a warning callout at the top of the initiative — with the full account in an `## Outcome` section, and show the short reason in the Closed list.

## Dependencies

_None._

## Decisions

- A short reason appears as a warning callout directly under the H1, using the GitHub/VitePress alert syntax so it renders as a highlighted box on both, e.g.

  ```markdown
  # Tag cloud in the collection README

  > [!WARNING]
  > **Abandoned** (2026-10-07): Mermaid can't draw a word cloud, and a generated SVG isn't worth a second file.
  ```

- The details — why, what was learned, what replaced it if anything — go in an `## Outcome` section. The design above it stays as the record of what was considered.
- The short reason is also kept as `status_note`, so the README's Closed list can show it: "17 Tag cloud (abandoned — Mermaid can't draw a word cloud…)".

## Open questions

- How is it written: does `set_status(ref, "abandoned")` take `reason` (short, for the callout and `status_note`) and `outcome` (the details), and refuse without a reason? And does `validate` warn about an abandoned initiative with no callout or `## Outcome` — including ones abandoned before this existed?
- Is the callout Brindley-managed — rewritten when `status_note` changes and removed if the initiative is reopened (`set_status` back to `draft`) — or written once and then left to the author? And do `superseded` (a `[!NOTE]` "Superseded by #N") and `deferred` (parked, with why) get the same treatment?

## Acceptance criteria

_What must be true when this is done._

