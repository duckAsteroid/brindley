---
type: feature
status: draft
updated: 2026-10-25
---
# Submit the Brindley plugin to Anthropic's directory

## Goal

Claude Code users find and install Brindley from Anthropic's plugin directory (as `brindley@synced`, auto-updated), not only from this repo's marketplace.

## Design

Submit the plugin from the developer portal (claude.ai/directory/manage), which reaches Claude Code users as `brindley@synced` and auto-updates them. Submitting needs a paid claude.ai plan, and the portal applies rules beyond `claude plugin validate --strict` (the pre-submission checklist on claude.com). Anthropic's official marketplace, `claude-plugins-official`, takes no public submissions, so it is out of scope.

## Dependencies

- [45 Install Brindley as a Claude Code plugin](done/45-install-brindley-as-a-claude-code-plugin.md) — the plugin must ship and be used from this repo's marketplace first

## Related

- https://code.claude.com/docs/en/plugins/publish.md — publishing a plugin: own marketplace and the directory
- https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md — official, community and demo marketplaces

## Open questions

- Is this worth doing at all, and when? It is a possible future enhancement once the plugin has been
  used from this repo's marketplace for a while; it needs a paid-plan account and Anthropic's review.
- (implementation) Will the directory accept an MCP server fetched from npm with `npx`, or does it
  want the server bundled in the plugin? The pages read so far don't say.

## Acceptance criteria

- The plugin is listed in Anthropic's directory and installs as `brindley@synced`.
- The portal's pre-submission checklist passes.
