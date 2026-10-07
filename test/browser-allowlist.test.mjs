import assert from "node:assert/strict";
import { test } from "node:test";
import { runHook, tmp, writeConfig } from "./helpers.mjs";

const config = writeConfig({ browserAllowlist: { domains: ["example.com", "Docs.Example.org."] } });
const nav = (url) => runHook("browser-allowlist", { tool_name: "browser_navigate", tool_input: { url } }, { config });

test("permite el dominio listado y sus subdominios", () => {
  assert.equal(nav("https://example.com/path?q=1").code, 0);
  assert.equal(nav("https://api.example.com").code, 0);
  assert.equal(nav("example.com").code, 0, "sin esquema");
  assert.equal(nav("https://docs.example.org").code, 0, "normaliza mayúsculas y punto final");
});

test("bloquea dominios fuera de la lista (exit 2 + motivo por stderr)", () => {
  const r = nav("https://evil.test/");
  assert.equal(r.code, 2);
  assert.match(r.stderr, /evil\.test/);
});

test("bloquea trucos de host: sufijo sin punto, userinfo, subdominio engañoso", () => {
  assert.equal(nav("https://notexample.com").code, 2);
  assert.equal(nav("https://example.com@evil.test/").code, 2);
  assert.equal(nav("https://example.com.evil.test/").code, 2);
  assert.equal(nav("https://evil.test/?u=example.com").code, 2);
});

test("loopback permitido, pero no hosts que solo empiezan por 127.", () => {
  assert.equal(nav("http://localhost:3000").code, 0);
  assert.equal(nav("http://127.0.0.1:8080/x").code, 0);
  assert.equal(nav("http://[::1]:8080/").code, 0);
  assert.equal(nav("http://127.evil.test/").code, 2);
});

test("allowLocalhost:false bloquea loopback", () => {
  const c = writeConfig({ browserAllowlist: { domains: ["example.com"], allowLocalhost: false } });
  const r = runHook("browser-allowlist", { tool_input: { url: "http://localhost" } }, { config: c });
  assert.equal(r.code, 2);
});

test("bloquea esquemas no http(s) y permite about:blank", () => {
  assert.equal(nav("file:///etc/passwd").code, 2);
  assert.equal(nav("javascript:alert(1)").code, 2);
  assert.equal(nav("about:blank").code, 0);
});

test("falla cerrado: payload ilegible", () => {
  assert.equal(runHook("browser-allowlist", "no es json", { config }).code, 2);
  assert.equal(runHook("browser-allowlist", "", { config }).code, 2);
  assert.equal(runHook("browser-allowlist", "[1]", { config }).code, 2);
});

test("falla cerrado: sin URL en tool_input", () => {
  assert.equal(runHook("browser-allowlist", { tool_input: {} }, { config }).code, 2);
  assert.equal(runHook("browser-allowlist", { tool_input: { href: "https://example.com" } }, { config }).code, 2);
});

test("urlFields permite otros nombres de campo y valida todos", () => {
  const c = writeConfig({ browserAllowlist: { domains: ["example.com"], urlFields: ["url", "href"] } });
  assert.equal(runHook("browser-allowlist", { tool_input: { href: "https://example.com" } }, { config: c }).code, 0);
  assert.equal(runHook("browser-allowlist", { tool_input: { url: "https://example.com", href: "https://evil.test" } }, { config: c }).code, 2);
});

test("falla cerrado: config ausente, inválida o sin la sección", () => {
  const missing = `${tmp()}/nope.json`;
  assert.equal(runHook("browser-allowlist", { tool_input: { url: "https://example.com" } }, { config: missing }).code, 2);
  assert.equal(runHook("browser-allowlist", { tool_input: { url: "https://example.com" } }, { config: writeConfig("{rota") }).code, 2);
  assert.equal(runHook("browser-allowlist", { tool_input: { url: "https://example.com" } }, { config: writeConfig({}) }).code, 2);
  const bad = writeConfig({ browserAllowlist: { domains: ["https://example.com/ruta"] } });
  assert.equal(runHook("browser-allowlist", { tool_input: { url: "https://example.com" } }, { config: bad }).code, 2);
});
