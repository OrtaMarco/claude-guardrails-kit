import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, tmp } from "./helpers.mjs";

const CLI = join(ROOT, "bin", "cli.mjs");
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const read = (f) => JSON.parse(readFileSync(f, "utf8"));

test("init fusiona sin pisar hooks, permisos ni claves ajenas", () => {
  const dir = tmp();
  const settings = join(dir, "settings.json");
  const mine = { hooks: [{ type: "command", command: "echo mio" }] };
  writeFileSync(settings, JSON.stringify({ model: "x", permissions: { allow: ["Bash(ls)"] }, hooks: { PreToolUse: [{ matcher: "Bash", ...mine }] } }));

  const r = cli("init", "--claude-dir", dir, "--allow-domain", "example.com");
  assert.equal(r.status, 0, r.stderr);

  const s = read(settings);
  assert.equal(s.model, "x");
  assert.deepEqual(s.permissions, { allow: ["Bash(ls)"] });
  assert.deepEqual(s.hooks.PreToolUse[0], { matcher: "Bash", ...mine });
  const ours = s.hooks.PreToolUse.slice(1);
  assert.deepEqual(ours.map((g) => g.matcher), ["mcp__browser__browser_(navigate|fetch)", "Artifact"]);
  assert.ok(ours[0].hooks[0].command.startsWith(`"${process.execPath}"`), "usa la ruta absoluta de node");
  assert.ok(existsSync(`${settings}.bak`));
  assert.ok(existsSync(join(dir, "guardrails", "lib.mjs")));
  assert.deepEqual(read(join(dir, "guardrails", "guardrails.config.json")).browserAllowlist.domains, ["example.com"]);
});

test("init es idempotente: dos corridas no duplican entradas", () => {
  const dir = tmp();
  cli("init", "--claude-dir", dir);
  const first = readFileSync(join(dir, "settings.json"), "utf8");
  cli("init", "--claude-dir", dir);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), first);
});

test("init no pisa una config existente del usuario", () => {
  const dir = tmp();
  cli("init", "--claude-dir", dir, "--allow-domain", "a.com");
  cli("init", "--claude-dir", dir, "--allow-domain", "b.com");
  assert.deepEqual(read(join(dir, "guardrails", "guardrails.config.json")).browserAllowlist.domains, ["a.com"]);
});

test("notas y recordatorio son opt-in y se omiten con aviso si falta el dato", () => {
  const dir = tmp();
  const r = cli("init", "--claude-dir", dir, "--hooks", "dirty-warn,context-reminder");
  assert.equal(r.status, 0);
  assert.match(r.stdout, /omitido: notes-autocommit y dirty-warn/);
  assert.match(r.stdout, /omitido: context-reminder/);
  assert.equal(read(join(dir, "settings.json")).hooks && Object.keys(read(join(dir, "settings.json")).hooks).length, 0);
});

test("con --notes-repo y --reminder se cablean los cinco eventos", () => {
  const dir = tmp();
  assert.equal(cli("init", "--claude-dir", dir, "--notes-repo", "~/notes", "--reminder", "hola").status, 0);
  assert.deepEqual(Object.keys(read(join(dir, "settings.json")).hooks).sort(), ["PreToolUse", "SessionEnd", "SessionStart", "Stop"]);
  const cfg = read(join(dir, "guardrails", "guardrails.config.json"));
  assert.deepEqual(cfg.notes, { repo: "~/notes", push: false });
  assert.equal(cfg.contextReminder.text, "hola");
});

test("--dry-run no escribe nada", () => {
  const dir = tmp();
  const r = cli("init", "--claude-dir", dir, "--dry-run");
  assert.equal(r.status, 0);
  assert.equal(existsSync(join(dir, "settings.json")), false);
  assert.equal(existsSync(join(dir, "guardrails")), false);
});

test("settings.json inválido aborta sin tocarlo", () => {
  const dir = tmp();
  writeFileSync(join(dir, "settings.json"), "{ esto no es json");
  const r = cli("init", "--claude-dir", dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no es JSON válido/);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), "{ esto no es json");
});

test("hook desconocido y scope inválido fallan con mensaje", () => {
  assert.equal(cli("init", "--claude-dir", tmp(), "--hooks", "nope").status, 1);
  assert.equal(cli("init", "--claude-dir", tmp(), "--scope", "global").status, 1);
});

test("uninstall quita solo lo nuestro y conserva la config", () => {
  const dir = tmp();
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo mio" }] }] } }));
  cli("init", "--claude-dir", dir);
  const r = cli("uninstall", "--claude-dir", dir);
  assert.equal(r.status, 0, r.stderr);
  const s = read(join(dir, "settings.json"));
  assert.equal(s.hooks.PreToolUse.length, 1);
  assert.equal(s.hooks.PreToolUse[0].hooks[0].command, "echo mio");
  assert.equal(existsSync(join(dir, "guardrails", "browser-allowlist.mjs")), false);
  assert.ok(existsSync(join(dir, "guardrails", "guardrails.config.json")));
});

test("e2e: el comando que escribió init bloquea de verdad", () => {
  const dir = tmp();
  cli("init", "--claude-dir", dir, "--allow-domain", "example.com");
  const group = read(join(dir, "settings.json")).hooks.PreToolUse.find((g) => g.matcher.includes("browser"));
  const run = (url) =>
    spawnSync(group.hooks[0].command, { shell: true, input: JSON.stringify({ tool_input: { url } }), encoding: "utf8" });
  assert.equal(run("https://example.com").status, 0);
  assert.equal(run("https://evil.test").status, 2);
});

test("list y ayuda", () => {
  assert.match(cli("list").stdout, /browser-allowlist\s+PreToolUse/);
  assert.match(cli("--help").stdout, /Usage/);
  assert.equal(cli("bogus").status, 1);
});
