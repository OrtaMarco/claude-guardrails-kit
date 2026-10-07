#!/usr/bin/env node
import { parseArgs } from "node:util";
import { HOOKS, init, uninstall } from "../src/install.mjs";

const USAGE = `claude-guardrails-kit — fail-closed hooks for Claude Code

Usage:
  claude-guardrails-kit init [options]
  claude-guardrails-kit uninstall [--scope user|project]
  claude-guardrails-kit list

init options:
  --scope user|project     user → ~/.claude/settings.json (default)
                           project → ./.claude/settings.local.json
  --allow-domain a.com,b   domains the browser hook may navigate (default: none)
  --browser-matcher RE     tool matcher for browser-allowlist
                           (default: mcp__browser__browser_(navigate|fetch))
  --artifact-root PATH     folder allowed for publishing (default: ~/artifacts)
  --notes-repo PATH        enables notes-autocommit + dirty-warn for this git repo
  --push                   let notes-autocommit push (default: off)
  --reminder TEXT          enables context-reminder with this text
  --hooks a,b              install only these hooks
  --dry-run                show what would change, write nothing
  --claude-dir PATH        override the .claude directory
`;

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") return console.log(USAGE);
  if (cmd === "list") {
    for (const [name, { event, matcher }] of Object.entries(HOOKS)) console.log(`${name.padEnd(20)} ${event}${matcher ? `  [${matcher}]` : ""}`);
    return;
  }
  if (cmd !== "init" && cmd !== "uninstall") throw new Error(`comando desconocido '${cmd}'\n\n${USAGE}`);

  const { values: v } = parseArgs({
    args: rest,
    options: {
      scope: { type: "string", default: "user" },
      "allow-domain": { type: "string" },
      "browser-matcher": { type: "string" },
      "artifact-root": { type: "string" },
      "notes-repo": { type: "string" },
      push: { type: "boolean", default: false },
      reminder: { type: "string" },
      hooks: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      "claude-dir": { type: "string" },
    },
  });
  const common = { scope: v.scope, claudeDir: v["claude-dir"], dryRun: v["dry-run"] };

  if (cmd === "uninstall") {
    const r = uninstall(common);
    console.log(`${r.removed} hook(s) quitados de ${r.target.settings}. ${r.target.hooksDir}/${"guardrails.config.json"} se conserva.`);
    return;
  }

  const r = init({
    ...common,
    allowDomains: v["allow-domain"] ? v["allow-domain"].split(",").map((s) => s.trim()).filter(Boolean) : [],
    browserMatcher: v["browser-matcher"],
    artifactRoot: v["artifact-root"],
    notesRepo: v["notes-repo"],
    push: v.push,
    reminder: v.reminder,
    hooks: v.hooks ? v.hooks.split(",").map((s) => s.trim()) : undefined,
  });
  console.log(`${r.dryRun ? "[dry-run] " : ""}settings: ${r.target.settings}`);
  for (const a of r.actions) console.log(`  + ${a}`);
  for (const s of r.skipped) console.log(`  - omitido: ${s}`);
  if (!r.dryRun) console.log(`\nEdita ${r.target.hooksDir}/guardrails.config.json y reinicia Claude Code.`);
}

try {
  main(process.argv.slice(2));
} catch (err) {
  console.error(`claude-guardrails-kit: ${err.message}`);
  process.exitCode = 1;
}
