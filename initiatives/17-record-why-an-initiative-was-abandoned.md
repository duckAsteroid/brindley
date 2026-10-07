---
type: feature
status: designed
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
- `set_status` gains `reason` (short: written as `status_note` and as the warning callout under the H1) and `outcome` (the details, written into `## Outcome`), for `abandoned` — and for whichever other statuses Q2 extends this to. A reason is required to abandon: without one `set_status` refuses ("say why with `reason` — it's shown at the top of the initiative and in the README"); `outcome` is optional. `validate` warns `abandoned-reason` about an abandoned initiative with no reason, exempting status taken from a legacy folder, as `docs-impact` does. `update`'s status recording (initiatives#6) accepts the same `reason` but doesn't require it, since an adopted file's reason may be unknown.
- The callout is Brindley-managed: the block directly under the H1, written from the status, its date and `status_note`. It is rewritten whenever the status or `status_note` changes (`set_status`, `update`) and removed when the initiative is reopened, so it never states something untrue; Brindley recognises its own callout by its first lines and touches nothing else. `## Outcome` belongs to the author once written: a reopen leaves it as the record. `superseded` and `deferred` get callouts too, as notes rather than warnings — `> [!NOTE]` `**Superseded** by [#N title](link) (date): reason` and `**Deferred** (date): reason` — with the reason optional for both; only `abandoned` requires one.

## Open questions

_None._

## Acceptance criteria

- `set_status` takes `reason` and `outcome`. Setting `abandoned` without a `reason` is refused with a message saying why one is needed; `superseded` and `deferred` take an optional `reason`.
- The reason is written as `status_note`, and a callout directly under the H1: `> [!WARNING]` / `> **Abandoned** (YYYY-MM-DD): reason` for abandoned; `> [!NOTE]` / `> **Superseded** by [#N title](link) (YYYY-MM-DD): reason` and `> [!NOTE]` / `> **Deferred** (YYYY-MM-DD): reason` for the others (the reason part omitted when there is none).
- `outcome` is written into an `## Outcome` section (added, or replaced if Brindley is given a new one); without `outcome` the section is untouched.
- The callout is kept in step: rewritten when the status or `status_note` changes through `set_status` or `update`, removed when the initiative moves to any other status (e.g. reopened to draft). Only Brindley's own callout block is changed; `## Outcome` and the rest of the body are not.
- `update`'s status recording (initiatives#6) accepts an optional `reason`, written the same way.
- The README's Closed list shows the reason after the status (`17 Tag cloud (abandoned — Mermaid can't draw…)`), and the Deferred list keeps showing it.
- `validate` warns `abandoned-reason` about an abandoned initiative with no `status_note`, unless its status comes from a status folder.
- FORMAT §5 (and §8.1 for the Closed list), MCP-SERVER.md and the site's statuses, MCP and validation references describe it. Tests cover each status's callout, the refusal, `outcome`, rewriting and removing the callout, reopening, the Closed list and the warning.
