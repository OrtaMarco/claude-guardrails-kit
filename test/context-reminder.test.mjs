import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook, tmp, writeConfig } from "./helpers.mjs";

const config = writeConfig({ contextReminder: { text: "Usa la herramienta X primero.", sources: ["startup", "compact"] } });

test("inyecta additionalContext en las fuentes configuradas", () => {
  for (const source of ["startup", "compact"]) {
    const r = runHook("context-reminder", { hook_event_name: "SessionStart", source }, { config });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, "SessionStart");
    assert.equal(out.additionalContext, "Usa la herramienta X primero.");
  }
});

test("no inyecta en fuentes no configuradas", () => {
  const r = runHook("context-reminder", { source: "clear" }, { config });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("sin payload asume startup", () => {
  assert.match(runHook("context-reminder", "", { config }).stdout, /additionalContext/);
});

test("config ausente o sin texto: error visible (exit 1), no bloquea la sesión con 2", () => {
  assert.equal(runHook("context-reminder", { source: "startup" }, { config: `${tmp()}/x.json` }).code, 1);
  assert.equal(runHook("context-reminder", { source: "startup" }, { config: writeConfig({ contextReminder: {} }) }).code, 1);
});
