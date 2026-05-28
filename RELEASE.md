# Release Process

## Versioning

detect-backend-threat follows [Semantic Versioning 2.0.0](https://semver.org/):

- **MAJOR** — breaking changes to the ingest API, detection engine API, or configuration schema
- **MINOR** — new scanners, new API endpoints, new dashboard features (backward-compatible)
- **PATCH** — bug fixes, dependency updates, performance improvements

## Release Cadence

- **Patch releases**: as needed, typically within days of a bug being confirmed
- **Minor releases**: roughly every 4–6 weeks
- **Major releases**: infrequently, with a deprecation notice at least one minor cycle in advance

## Cutting a Release

1. Ensure `main` is green (all CI jobs passing).
2. Update `CHANGELOG.md` with the release notes (use `Unreleased` → version header).
3. Create and push the version tag:
   ```bash
   git tag -a v1.2.3 -m "Release v1.2.3"
   git push origin v1.2.3
   ```
4. The `release` GitHub Actions workflow triggers automatically:
   - Builds multi-arch Docker images (`linux/amd64`, `linux/arm64`)
   - Pushes to `ghcr.io/vignesh2027/detect-backend-threat:{version,latest}`
   - Creates a GitHub Release with generated changelog

## Docker Images

| Tag | Description |
|---|---|
| `ghcr.io/vignesh2027/detect-backend-threat:latest` | Latest stable release |
| `ghcr.io/vignesh2027/detect-backend-threat:v1.2.3` | Specific version |
| `ghcr.io/vignesh2027/detect-backend-threat:main` | Tip of main (not for production) |

## Changelog Format

We follow [Keep a Changelog](https://keepachangelog.com) conventions:

```markdown
## [1.2.3] - 2026-05-28

### Added
- New YARA scanner integration

### Fixed
- AbuseIPDB cache TTL not respected on 429 responses

### Changed
- ClamAV timeout increased to 15s default
```

## Hotfix Process

For critical security or stability fixes:

1. Branch from the affected tag: `git checkout -b hotfix/v1.2.4 v1.2.3`
2. Apply the fix and tests
3. Tag and release as above
4. Cherry-pick to `main`
