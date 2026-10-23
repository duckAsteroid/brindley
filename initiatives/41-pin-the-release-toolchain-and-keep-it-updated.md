---
type: chore
status: draft
tags: [security]
updated: 2026-10-23
---
# Pin the release toolchain and keep it updated

## Goal

Every action and tool the workflows run is pinned to an exact, reviewed version, and Dependabot proposes updates after a cooldown.

## Background

Both workflows use actions by moving tag (`actions/checkout@v4`, `actions/setup-node@v4`, and in `pages.yml` `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`), and the repo does not require SHA pinning. The release job holds `id-token: write`, so a hijacked action tag could publish to npm as Brindley. `npm install -g npm@latest` (`.github/workflows/release.yml:31`) runs whatever npm was released most recently in the same job. There is no `.github/dependabot.yml`, and Dependabot security updates are off.

## Design

- Pin every `uses:` to a full commit SHA with the version in a trailing comment
  (`actions/checkout@<sha> # v4.x.y`).
- Pin npm to an exact version (11.5.1 or later, as trusted publishing needs).
- Turn on the repo's "Require actions to be pinned to a full-length commit SHA" setting.
- Add `.github/dependabot.yml` for `github-actions` and `npm` (root and `site/`), with a cooldown so
  a newly published version is not proposed for several days.
- Turn on Dependabot security updates.

## Dependencies

_None._

## Open questions

- How long a cooldown — e.g. 7 days for routine updates? Security updates bypass it either way.
- (implementation) Does Dependabot's `github-actions` ecosystem keep the npm version in the
  `npm install -g` step current, or is that a manual bump recorded in the release checklist?

## Acceptance criteria

- No workflow `uses:` an action by tag or branch; `sha_pinning_required` is true.
- `release.yml` installs a fixed npm version.
- `.github/dependabot.yml` covers actions, the root package and `site/`, with a cooldown.
- Dependabot security updates are enabled.
- A settled decision on how the npm version is kept current.
