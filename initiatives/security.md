---
theme: security
---
# Security

Brindley is published to npm by `.github/workflows/release.yml` whenever a `v*.*.*` tag is pushed,
using npm trusted publishing (OIDC) with provenance. Outside contributors cannot reach that path:
no workflow runs on pull requests, and the default `GITHUB_TOKEN` is read-only. Anyone who can
push a tag, or any code that runs inside the release job, can publish, though.

A review on 2026-10-23 found these routes to a compromised release:

- **A push-capable token for the owner's account** (e.g. the `gh` CLI token, scopes `repo` and
  `workflow`) can push a tag. `main` is unprotected, there are no tag rulesets, the `npm`
  environment has no protection rules, the tagged commit need not be on `main`, and tags are not
  signed.
- **A hijacked third-party action**: actions are pinned to moving tags (`actions/checkout@v4`,
  `actions/setup-node@v4`), and the release job holds `id-token: write`.
- **`npm install -g npm@latest`** in the release job runs whichever npm was released most recently.
- **The npm account directly**: if the package still accepts tokens, one from a developer's
  `~/.npmrc` publishes without going through GitHub at all.

Provenance does not help against the first three: a release published through the workflow is
attested as genuine.

<!-- brindley:generated:begin — do not edit by hand; regenerate instead -->

### Initiatives in this theme

Tagged `security`: 6 open, 0 closed or deferred.

| Ref | Initiative | Type | Status | Ready / blocked by |
|-----|------------|------|--------|--------------------|
| `initiatives#37` | [Publish to npm only through trusted publishing](37-publish-to-npm-only-through-trusted-publishing.md) | chore | draft | — |
| `initiatives#38` | [Protect release tags and main](38-protect-release-tags-and-main.md) | chore | draft | — |
| `initiatives#39` | [Restrict the npm deployment environment](39-restrict-the-npm-deployment-environment.md) | chore | draft | — |
| `initiatives#40` | [Release only commits on main](40-release-only-commits-on-main.md) | chore | draft | — |
| `initiatives#41` | [Pin the release toolchain and keep it updated](41-pin-the-release-toolchain-and-keep-it-updated.md) | chore | draft | — |
| `initiatives#42` | [Harden the maintainer's GitHub and npm accounts](42-harden-the-maintainer-s-github-and-npm-accounts.md) | chore | draft | — |

<!-- brindley:generated:end -->
