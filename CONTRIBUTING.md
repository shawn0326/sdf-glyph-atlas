# Contributing

Thank you for helping improve `sdf-glyph-atlas`.

[简体中文](CONTRIBUTING.zh-CN.md)

## Setup

Use Node.js 24 and npm 11:

```sh
npm install
npx playwright install chromium
npm run check
```

`npm run check` formats nothing and uses Chromium for browser coverage. Run `npm run format` to apply Biome's safe formatting and lint fixes.

To reproduce the complete CI and release matrix locally:

```sh
npx playwright install chromium firefox webkit
npm run check:ci
```

## Changes

- Keep the package renderer-independent and free of runtime dependencies unless a proposal demonstrates a clear need.
- Add deterministic unit tests for algorithm, packing, or cache changes.
- Add browser coverage when behavior depends on a real Canvas implementation.
- Avoid exact browser pixel snapshots because rasterization varies by operating system and font backend.
- Update both README languages when changing public behavior.
- Do not edit generated `dist` files.

Commits use [Conventional Commits](https://www.conventionalcommits.org/): `fix:` produces a patch release, `feat:` produces a minor release, and `!` or a `BREAKING CHANGE` footer marks an incompatible change. Release Please maintains the release PR, version, changelog, tag, and GitHub Release from commits merged to `master`.

## Pull requests

Before opening a pull request:

```sh
npm run check
git status --short
```

Describe observable behavior changes, document compatibility implications, and include tests. The `master` branch is expected to remain releasable.

Repository administrators should keep `master` as the default branch and protect it in GitHub: require the `Validate package` status check before merging, and block force pushes and branch deletion.

## Releasing

Merging the Release Please PR creates a `vX.Y.Z` GitHub Release and attaches a tested npm tarball plus its SHA-256 checksum. npm publication is intentionally manual:

1. Before the first publication, run `npm view sdf-glyph-atlas name` and confirm that the package name is still available. Stop if an existing package is returned.
2. Download both release attachments.
3. Verify the tarball against the `.sha256` file.
4. Confirm the npm account has two-factor authentication enabled.
5. Publish the artifact with `npm publish ./sdf-glyph-atlas-X.Y.Z.tgz --access public`.
6. Verify the registry metadata with `npm view sdf-glyph-atlas@X.Y.Z`.

To publish from a clean local checkout instead, install all three Playwright browsers, check out the exact `vX.Y.Z` tag, and run `npm publish`. The `prepublishOnly` guard runs the complete browser matrix and rejects a dirty tree, an untagged commit, a tag/version mismatch, or the development placeholder version.
