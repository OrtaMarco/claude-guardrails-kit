import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { git, initRepo, runHook, tmp, writeConfig } from "./helpers.mjs";

const cfgFor = (repo, extra = {}) => writeConfig({ notes: { repo, ...extra } });
const NOW = { GUARDRAILS_NOW: "2026-10-06T12:30:00Z" };

test("autocommit: commitea lo sucio con el mensaje configurado", () => {
  const repo = initRepo();
  writeFileSync(join(repo, "nueva.md"), "nota");
  const r = runHook("notes-autocommit", { hook_event_name: "SessionEnd" }, { config: cfgFor(repo, { message: "notas: guardado ({timestamp})" }), env: NOW });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.equal(git(repo, "log", "-1", "--format=%s"), "notas: guardado (2026-10-06 12:30)");
  assert.match(readFileSync(join(repo, ".git", "guardrails-autocommit.log"), "utf8"), /commiteados 1 archivo/);
});

test("autocommit: repo limpio no crea commits", () => {
  const repo = initRepo();
  const before = git(repo, "rev-parse", "HEAD");
  assert.equal(runHook("notes-autocommit", {}, { config: cfgFor(repo) }).code, 0);
  assert.equal(git(repo, "rev-parse", "HEAD"), before);
});

test("autocommit: no toca nada si hay cambios ya preparados por otro", () => {
  const repo = initRepo();
  writeFileSync(join(repo, "staged.md"), "s");
  git(repo, "add", "staged.md");
  writeFileSync(join(repo, "suelto.md"), "u");
  const before = git(repo, "rev-parse", "HEAD");
  assert.equal(runHook("notes-autocommit", {}, { config: cfgFor(repo) }).code, 0);
  assert.equal(git(repo, "rev-parse", "HEAD"), before);
  assert.match(git(repo, "status", "--porcelain"), /suelto\.md/);
});

test("autocommit: si el pre-commit bloquea, NO fuerza y sale ≠ 0", () => {
  const repo = initRepo();
  writeFileSync(join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho secreto >&2\nexit 1\n", { mode: 0o755 });
  writeFileSync(join(repo, "n.md"), "x");
  const r = runHook("notes-autocommit", {}, { config: cfgFor(repo) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /commit FALLÓ/);
  assert.match(git(repo, "status", "--porcelain"), /n\.md/);
});

test("autocommit: push solo si notes.push=true", () => {
  const remote = tmp("cgk-remote-");
  git(remote, "init", "-q", "--bare", "-b", "main");
  for (const push of [false, true]) {
    const repo = initRepo();
    git(repo, "remote", "add", "origin", remote);
    git(repo, "push", "-q", "-u", "origin", "main");
    writeFileSync(join(repo, "n.md"), "x");
    assert.equal(runHook("notes-autocommit", {}, { config: cfgFor(repo, { push }) }).code, 0);
    const ahead = git(repo, "rev-list", "--count", "@{upstream}..HEAD");
    assert.equal(ahead, push ? "0" : "1");
    git(remote, "update-ref", "-d", "refs/heads/main");
  }
});

test("falla visible: config ausente, repo inexistente o git no instalado", () => {
  assert.equal(runHook("notes-autocommit", {}, { config: writeConfig({}) }).code, 1);
  assert.equal(runHook("notes-autocommit", {}, { config: cfgFor(join(tmp(), "no-existe")) }).code, 1);
  const repo = initRepo();
  writeFileSync(join(repo, "n.md"), "x");
  const r = runHook("notes-autocommit", {}, { config: cfgFor(repo), env: { PATH: tmp() } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /git no está instalado/);
  assert.ok(existsSync(join(repo, "n.md")));
});

const stop = (repo, payload = {}, env = {}) => runHook("dirty-warn", { hook_event_name: "Stop", ...payload }, { config: cfgFor(repo), env });
const blocked = (r) => r.code === 0 && r.stdout && JSON.parse(r.stdout).decision === "block";

test("dirty-warn: repo limpio pasa", () => {
  assert.equal(stop(initRepo()).stdout, "");
});

test("dirty-warn: repo sucio bloquea una vez y lista los archivos", () => {
  const repo = initRepo();
  writeFileSync(join(repo, "pendiente.md"), "x");
  const r = stop(repo);
  assert.ok(blocked(r));
  assert.match(JSON.parse(r.stdout).reason, /pendiente\.md/);
});

test("dirty-warn: stop_hook_active evita el bucle", () => {
  const repo = initRepo();
  writeFileSync(join(repo, "pendiente.md"), "x");
  assert.equal(stop(repo, { stop_hook_active: true }).stdout, "");
});

test("dirty-warn: avisa de commits sin pushear", () => {
  const remote = tmp("cgk-remote-");
  git(remote, "init", "-q", "--bare", "-b", "main");
  const repo = initRepo();
  git(repo, "remote", "add", "origin", remote);
  git(repo, "push", "-q", "-u", "origin", "main");
  writeFileSync(join(repo, "n.md"), "x");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "local");
  assert.match(JSON.parse(stop(repo).stdout).reason, /1 commit\(s\) sin pushear/);
});

test("dirty-warn: falla cerrado sin git, con config rota o repo inexistente", () => {
  const repo = initRepo();
  assert.ok(blocked(stop(repo, {}, { PATH: tmp() })));
  assert.ok(blocked(runHook("dirty-warn", {}, { config: writeConfig({}) })));
  assert.ok(blocked(stop(join(tmp(), "no-existe"))));
});
