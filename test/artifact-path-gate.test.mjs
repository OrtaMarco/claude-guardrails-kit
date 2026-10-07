import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { decision, runHook, tmp, writeConfig } from "./helpers.mjs";

const base = tmp();
const root = join(base, "artifacts");
mkdirSync(root);
const outside = join(base, "private");
mkdirSync(outside);
writeFileSync(join(outside, "secret.html"), "x");
symlinkSync(outside, join(root, "escape"));
const config = writeConfig({ artifactGate: { root } });
const publish = (file_path, extra = {}, cwd = base) =>
  runHook("artifact-path-gate", { tool_name: "Artifact", cwd, tool_input: { file_path, ...extra } }, { config });

test("permite publicar bajo la raíz (también archivos aún inexistentes)", () => {
  assert.equal(publish(join(root, "dash.html")).code, 0);
  assert.equal(publish(join(root, "dash.html")).stdout, "");
  assert.equal(publish(join(root, "sub", "nuevo.html")).stdout, "");
  assert.equal(publish("artifacts/rel.html").stdout, "", "ruta relativa contra cwd");
});

test("deniega fuera de la raíz con JSON permissionDecision=deny", () => {
  const r = publish(join(outside, "secret.html"));
  assert.equal(r.code, 0);
  assert.equal(decision(r), "deny");
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /limitado/i);
});

test("deniega escapes: .., symlink que sale de la raíz, prefijo de nombre parecido, la raíz misma", () => {
  assert.equal(decision(publish(join(root, "..", "private", "secret.html"))), "deny");
  assert.equal(decision(publish(join(root, "escape", "secret.html"))), "deny");
  assert.equal(decision(publish(join(base, "artifacts-evil", "x.html"))), "deny");
  assert.equal(decision(publish(root)), "deny");
});

test("action=list pasa; sin file_path deja que falle la validación del tool", () => {
  assert.equal(publish(join(outside, "secret.html"), { action: "list" }).stdout, "");
  assert.equal(runHook("artifact-path-gate", { tool_input: {} }, { config }).stdout, "");
});

test("falla cerrado: payload ilegible", () => {
  assert.equal(decision(runHook("artifact-path-gate", "basura", { config })), "deny");
});

test("falla cerrado: config ausente / sin sección", () => {
  const r = runHook("artifact-path-gate", { tool_input: { file_path: join(root, "a.html") } }, { config: `${tmp()}/x.json` });
  assert.equal(decision(r), "deny");
  const r2 = runHook("artifact-path-gate", { tool_input: { file_path: join(root, "a.html") } }, { config: writeConfig({}) });
  assert.equal(decision(r2), "deny");
});
