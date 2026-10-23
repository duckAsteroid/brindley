---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Restrict the npm deployment environment

## Goal

The `npm` environment deploys only from `v*` tags, and a publish waits for the owner's approval.

## Background

The release job runs in the `npm` environment (`.github/workflows/release.yml:17`), which has no protection rules and no deployment branch/tag policy. Any workflow on any ref could use it, and nothing pauses before publishing.

## Design

- Deployment policy: custom, allowing tags matching `v*` only.
- Required reviewer: the repo owner. A stolen token with `repo` scope can approve its own
  deployment, so this mainly guards against code running in the job (a hijacked action or tool)
  and gives the owner a notification before anything is published.
- Turn off "Allow administrators to bypass configured protection rules".

## Dependencies

_None._

## Related

- [Publish to npm only through trusted publishing](37-publish-to-npm-only-through-trusted-publishing.md) — the trusted publisher names this environment

## Open questions

_None._

## Acceptance criteria

- `gh api repos/duckAsteroid/brindley/environments/npm` shows a `v*` tag policy, the owner as
  required reviewer, and `can_admins_bypass: false`.
- A release run pauses for approval before the publish job starts.
