---
type: feature
status: done
updated: 2026-10-07
tags: [dependency-links, text]
docs_impact:
  - MCP-SERVER.md
  - site/reference/mcp.md
---
# set_dependencies explains links it cannot remove

## Goal

`set_dependencies(remove=…)` deletes bullets. When the link sits in an ordinary paragraph under `## Dependencies` it is left in place — still a blocking edge — and the warning wrongly says it is "not linked". Make the warning say where the link is and how to fix it by hand, with the same advice as the cycle error (initiatives#4). Same for `related_remove` under `## Related`.

## Dependencies

_None._

## Related

- [GitHub #3](https://github.com/duckAsteroid/brindley/issues/3) — the request this came from
- [4 Cycle errors advise where back-references belong](04-flag-reverse-direction-links-under-dependencies.md) — gives the same advice for where to move a link

## Decisions

- `remove` keeps deleting only bullets (a link inside a bullet already removes the whole bullet, src/ops.ts:523–528). No paragraph editing and no "move to Related" operation. What changes is the message for a link in a paragraph, which today is the false "not linked under ## Dependencies": it says where the link is and gives the same advice as the cycle error (initiatives#4) — e.g. "initiatives#23 is linked in a paragraph under ## Dependencies (line 14), not a bullet, so it was not removed. Edit the text: delete the link, or move the sentence to ## Related (keeps a non-blocking link) or ## See also (a plain link)." The same applies to `related_remove` under `## Related`.

## Open questions

_None._

## Acceptance criteria

- `set_dependencies` with `remove` still deletes the whole bullet when the link is in a list item.
- When the only link to the target under `## Dependencies` is in a paragraph, nothing is changed and the warning names the line and gives the advice from initiatives#4, e.g. "initiatives#23 is linked in a paragraph under ## Dependencies (line 14), not a bullet, so it was not removed. Edit the text: delete the link, or move the sentence to ## Related or ## See also."
- "is not linked" is only reported when the target is genuinely not linked in that section.
- `related_remove` behaves the same under `## Related`.
- The tool description says it removes bullets only. Tests cover bullet, paragraph and absent links in both sections.
