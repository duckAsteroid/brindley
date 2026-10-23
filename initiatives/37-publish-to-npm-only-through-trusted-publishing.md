---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Publish to npm only through trusted publishing

## Goal

The `brindley` npm package can be published only by `release.yml` running in the `npm` environment, never with an npm token.

## Background

`release.yml` publishes with `npm publish --provenance` over OIDC; no `NPM_TOKEN` secret exists at repo or environment level, though the workflow still passes `secrets.NPM_TOKEN` as a fallback (`.github/workflows/release.yml:50-53`). Unless the package is set to disallow tokens, an npm token on any maintainer machine (e.g. in `~/.npmrc`) publishes without going through GitHub, the tag, or provenance.

## Design

- On npmjs.com, confirm the package's trusted publisher names repository `duckAsteroid/brindley`,
  workflow `release.yml` and environment `npm`.
- Set the package's publishing access to "Require two-factor authentication and disallow tokens".
- Revoke any npm automation or publish tokens that are no longer needed.
- Remove the `NODE_AUTH_TOKEN` fallback from `release.yml`, and its comment.

## Dependencies

_None._

## Open questions

_None._

## Acceptance criteria

- The trusted publisher on npmjs.com is limited to `release.yml` and the `npm` environment.
- The package disallows token publishing; `npm access get status`/the package settings page shows it.
- `release.yml` no longer references `NPM_TOKEN`, and the next release still publishes with provenance.
