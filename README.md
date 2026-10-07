# claude-guardrails-kit

Installable, **fail-closed** hooks for [Claude Code](https://code.claude.com/docs/en/hooks).
Zero dependencies, Node ≥ 20, one JSON config file. [Español](README.es.md)

Hooks run outside the model's reasoning, so the model cannot talk its way past them. The
catch: a hook that assumes a dependency (`jq`, a list file, a binary) and doesn't find it
usually **lets everything through, silently**. Every gate in this kit blocks when it cannot
decide: unreadable payload, missing config, unparseable URL, missing `git`.

| Hook | Event | Threat it covers |
|---|---|---|
| [`browser-allowlist`](#browser-allowlist) | `PreToolUse` | prompt injection from a hostile site in a browser that holds logged-in sessions |
| [`artifact-path-gate`](#artifact-path-gate) | `PreToolUse` | publishing a file from outside the folder meant for publishing |
| [`notes-autocommit`](#notes-autocommit) | `SessionEnd` | notes written to disk that never reach git |
| [`dirty-warn`](#dirty-warn) | `Stop` | ending a turn with the notes repo dirty or unpushed |
| [`context-reminder`](#context-reminder) | `SessionStart` | the model forgetting standing instructions after `/clear` or compaction |

## Install

```bash
npx claude-guardrails-kit init \
  --allow-domain example.com,github.com \
  --notes-repo ~/notes \
  --reminder "Always read the project index before editing."
```

`init` copies the hooks to `~/.claude/guardrails/` (self-contained: no `npx` or network at
run time), writes `guardrails.config.json` if absent, and **merges** `~/.claude/settings.json`:
your own hooks, permissions and keys are untouched, running it twice changes nothing, and a
`settings.json.bak` is written first. If `settings.json` isn't valid JSON, `init` aborts.

- Default hooks: `browser-allowlist` and `artifact-path-gate`. Notes hooks need `--notes-repo`,
  the reminder needs `--reminder`; otherwise they are skipped with a message.
- Commands embed the absolute path of the `node` that ran `init`. A bare `node` that isn't
  on the hook's PATH exits 127, which Claude Code treats as a *non-blocking* error, so the
  call would go through. That is the failure mode this kit exists to avoid.
- `--scope project` writes `./.claude/settings.local.json` instead (not meant for git, since
  it contains that machine-specific path).
- `--dry-run` shows what would change. `uninstall` removes only our entries and keeps your config.
- `--browser-matcher` sets which MCP tools get the allowlist (default
  `mcp__browser__browser_(navigate|fetch)`; match **your** browser MCP's navigation tool names).
  Tool matching is by regex on the tool name, see the [hooks reference](https://code.claude.com/docs/en/hooks).

## Configuration

`guardrails.config.json`, found via `$CLAUDE_GUARDRAILS_CONFIG` or next to the hooks. Only a
leading `~` is expanded.

```json
{
  "browserAllowlist": { "domains": ["example.com"], "allowLocalhost": true, "urlFields": ["url"] },
  "artifactGate": { "root": "~/artifacts" },
  "notes": { "repo": "~/notes", "push": false, "message": "chore: autosave ({timestamp})" },
  "contextReminder": { "text": "…", "sources": ["startup", "resume", "clear", "compact"] }
}
```

## Hooks

### browser-allowlist

**Threat:** a browser MCP attached to a Chrome with logged-in sessions navigates to a
hostile page whose content injects instructions, with your cookies one click away.

Allows only `http(s)` URLs whose host is a listed domain or one of its subdomains
(`example.com` covers `api.example.com`, not `notexample.com`). Loopback passes unless
`allowLocalhost` is `false`. Blocks (exit 2, reason on stderr) everything else, including:
`file:`/`javascript:` URLs, `https://example.com@evil.test`, `example.com.evil.test`,
`127.evil.test`, tool input with no URL, a missing/invalid config.

```console
$ echo '{"tool_input":{"url":"https://evil.test"}}' | node ~/.claude/guardrails/browser-allowlist.mjs
Bloqueado: 'evil.test' no está en la lista permitida de navegación. …
$ echo $?
2
```

### artifact-path-gate

**Threat:** an `Artifact`-style publish tool uploads a file from your repo or notes vault.
The path is also the artifact's identity, so publishing from a throwaway directory mints a new URL
on every update.

Denies (structured `permissionDecision: "deny"`, so the model reads the reason and moves the
file itself) any publish whose real path isn't under `artifactGate.root`. Paths are resolved
with symlinks, `..` and relative-to-`cwd` handled; `action: "list"` passes.

### notes-autocommit

**Threat:** notes saved to disk but never committed. Commits a dirty repo at `SessionEnd` with a
generic message; pushes only if `notes.push` is `true`. It never uses `--no-verify` (a
secret-scanning pre-commit still wins), and does nothing when another process has staged changes.
`SessionEnd` can't block, so failures go to `.git/guardrails-autocommit.log` and exit 1.

### dirty-warn

**Threat:** a turn that ends with unsaved notes. Blocks the stop **once** (`decision: "block"`)
so the model commits with a hand-written message. `stop_hook_active` prevents loops. No `git`,
bad config or missing repo also blocks once, with an explicit reason, instead of staying silent.

### context-reminder

Injects `contextReminder.text` as `additionalContext` on the configured `SessionStart` sources.

## Develop

```bash
npm test        # node --test: runs each hook as a real process with simulated JSON input
npm run check   # syntax check
```

Not a sandbox and not a Bash command filter: use Claude Code's permissions for that.
See [DESIGN.md](DESIGN.md) for scope, exit-code contract and alternatives.

## License

MIT © Marco Orta
