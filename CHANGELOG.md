# Changelog

## [0.1.0] - Unreleased

### Added
- Five fail-closed hooks: `browser-allowlist`, `artifact-path-gate`, `notes-autocommit`,
  `dirty-warn`, `context-reminder`.
- `claude-guardrails-kit init | uninstall | list`: copies the hooks and merges
  `settings.json` without overwriting existing entries (idempotent, writes a `.bak`).
- Single JSON config (`guardrails.config.json`), zero runtime dependencies, Node ≥ 20.
- Test suite (`node --test`) that runs every hook as a real process and checks decisions
  and exit codes, including the failure paths.
