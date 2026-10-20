---
type: feature
status: designed
updated: 2026-10-20
---
# Milestones

## Goal

Let a repo name its milestones — significant functions it delivers, such as "booking works end to end" — and say which initiatives, from any collection or theme, make each one up. A milestone is not itself work: it has no lifecycle of its own and is never implemented. It is reached when the initiatives it gathers are done, and tools show how near each milestone is and what still stands between it and delivery.

## Dependencies

_None._

## Related

- [12 Themes section in the collection README](done/12-themes-overview-and-tag-cloud-in-the-collection-readme.md)
- [30 One-page HTML progress dashboard](done/30-one-page-html-progress-dashboard.md)

## Decisions

- A milestone is defined by a milestone doc, shaped like a theme overview doc: a non-numbered `.md` in any collection folder with `milestone: <slug>` front-matter (plus optional `summary`, and an optional `icon` as a theme doc has — where it shows is settled with where milestones appear), written by people, with a generated block Brindley keeps current showing the milestone's members and progress. Not being numbered, it never enters lifecycle or readiness rules.
- The milestone doc points at its members: it lists the initiatives that deliver it as links in its body (relative paths, `collection#n`, or external URLs, as under `## Dependencies`). The list sits under a `## Delivered by` heading. Initiatives carry nothing about milestones, so a milestone's definition is reviewable in one file.
- A milestone can include a whole theme, written as a link to the theme's overview doc among its members. It stands for every initiative tagged with the theme, found live, so initiatives tagged later join the milestone. A tag with no theme doc cannot be included this way.
- "Reached" is computed only, never recorded: a milestone is reached while every member is done, ignoring abandoned, superseded and deferred members. The date it was reached comes from git history (the commit where its last outstanding member became done). Because theme membership is live, a reached milestone becomes unreached again when a new open initiative joins.
- External members (http links) are ignored when computing "reached", as external dependencies are for readiness, and are shown as unconfirmed wherever the milestone's progress is shown, e.g. "reached (1 external member not confirmed)".
- Milestones nest by link: a milestone's members may include another milestone doc, meaning it is reached only when that milestone is too. There is no separate ordering between milestones. An included milestone's initiatives count towards the including milestone's progress, and the progress names any included milestone still outstanding. A cycle of milestones including each other is a validation error.
- Milestones have no target dates: a milestone says what is delivered, not when. Scheduling stays outside Brindley.
- Milestones show up in six places: (1) the milestone doc's generated block — each member with status, "n of m done", what is outstanding, included milestones and unconfirmed external members (no reached date, since a block cannot know the commit it lands in); (2) a new `milestones` tool listing every milestone with progress, whether reached, the reached date from git history, and outstanding members; (3) `get` on an initiative, naming the milestones it counts towards, directly, via a theme or via nesting; (4) a Milestones section in the collection README listing each milestone that includes any of the collection's initiatives, with progress, linking its doc; (5) the dependency graph, with a `graph: { milestones: icon }` option that marks members with the milestone's `icon` as `themes: icon` does (milestones are not nodes); (6) the progress report, marking the date each milestone was reached on its timeline. In addition, every tool that changes an initiative's status (`complete`, `set_status`, `batch_update`, `update`) reports the milestones that change reached — e.g. "By completing this initiative you have reached milestone Self-adoption" — as `complete` already reports which initiatives became ready. A change to done, abandoned, superseded or deferred can reach a milestone, since the latter three are ignored.
- Tools also report when a change makes a milestone no longer reached — reopening a done member, or a new open initiative joining an included theme (`create`, or `update`/`batch_update` changing tags) — e.g. "This change means milestone v1 is no longer reached (#34 is open)". Tools report only when a milestone's reached state flips, either way, never on mere progress.
- A milestone with no counted members — no members listed, only empty themes, or every member abandoned, superseded or deferred — is unspecified: never reached, shown as unspecified rather than as progress, and never reported as reached. A milestone needs at least one done member to be reached. `validate` warns about a milestone doc that lists no members.

## Open questions

_None._

## Acceptance criteria

- [ ] A non-numbered `.md` in a collection folder with `milestone: <slug>` front-matter is loaded as a milestone, with optional `summary` and `icon`; it is never an initiative and never enters lifecycle, readiness or numbering. Two docs with the same slug are a validation error.
- [ ] Its members are the links listed under its `## Delivered by` heading: initiatives (relative path or `collection#n`), theme overview docs, other milestone docs, and external URLs. A link that resolves to none of these is a validation error, as a dangling dependency is.
- [ ] A linked theme doc stands for every initiative tagged with that theme, found live at each read.
- [ ] A linked milestone doc nests: the including milestone is reached only when the included one is, and the included milestone's initiatives count towards its progress. A cycle of milestones is a validation error.
- [ ] A milestone is reached when it has at least one done member and every counted member is done (abandoned, superseded and deferred are not counted). With no counted members it is unspecified, never reached. External members are not counted and are reported as unconfirmed. `validate` warns about a milestone doc that lists no members.
- [ ] The milestone doc gets a generated block, kept current by `regenerate_readmes`, listing each member with status, "n of m done", what is outstanding, included milestones and unconfirmed external members — or that it is unspecified. It is deterministic and carries no reached date.
- [ ] A `milestones` tool lists every milestone with its progress, reached/unreached/unspecified, the reached date from git history (the first-parent commit where it last became reached), outstanding members and unconfirmed external members.
- [ ] `get` on an initiative names the milestones it counts towards, and how: directly, via a theme, or via a nested milestone.
- [ ] A collection README gets a Milestones section listing each milestone that includes any of the collection's initiatives, with progress, linking the milestone doc.
- [ ] `graph: { milestones: icon }` marks each member initiative with its milestones' icons (`[slug]` without one) before its title, with a legend, as `themes: icon` does.
- [ ] The progress report marks the date each milestone was reached on its timeline.
- [ ] `complete`, `set_status`, `update`, `batch_update` and `create` report each milestone whose reached state their change flipped — e.g. "By completing this initiative you have reached milestone Self-adoption" or "This change means milestone v1 is no longer reached (#34 is open)" — and nothing when no milestone flipped.
- [ ] FORMAT.md, MCP-SERVER.md and the docs site describe milestone docs, their members, reached/unspecified, and the `milestones` tool and graph option.
