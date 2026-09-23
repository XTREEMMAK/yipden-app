# Changelog

Every notable change to YipDen, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2026-09-22

The first commit. Workspace, tooling and the ring client.

### Added

- pnpm workspace with TypeScript in strict mode, ESLint, Prettier and Vitest.
- `packages/ring-client`: a framework agnostic, dependency free client for the IndieNodes
  ring document. Conditional GET with ETag and If-Modified-Since, an injectable fetch and
  cache, per entry validation that never discards the whole ring, URL safety checks, a
  deterministic daily rotation, shuffle, and filters by type, form and tag.
- A JSON Schema for the ring document as a reader consumes it, checked against the live ring,
  an extended ring carrying the fields the ring does not emit yet, and a hostile fixture.
- Repository documentation: architecture, security, the ring contract, CI and decisions.

[unreleased]: https://github.com/XTREEMMAK/yipden-app/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/XTREEMMAK/yipden-app/releases/tag/v0.0.1
