# DESIGN — claude-guardrails-kit

## Problema

Los hooks de Claude Code son el único barandal que el modelo no puede razonar para
saltarse (corren fuera de su contexto), pero escribirlos bien es fácil de hacer mal: un
hook que asume una dependencia (`jq`, una lista, un binario) y no la encuentra **deja
pasar todo en silencio**. Además, cada quien los reescribe con rutas fijas.

## Usuario

Quien usa Claude Code a diario con un navegador logueado, un directorio de artifacts
publicables o un repo de notas, y quiere barandales configurables, probados y que fallen
cerrados.

## Alcance v0.1

Cinco hooks, Node ≥ 20, **cero dependencias**, configuración en un solo JSON:

| Hook | Evento | Amenaza que cubre |
|---|---|---|
| `browser-allowlist` | PreToolUse (matcher configurable, p. ej. `mcp__browser__.*`) | prompt injection desde un dominio hostil en un navegador con sesiones logueadas |
| `artifact-path-gate` | PreToolUse (`Artifact`) | publicar por accidente un archivo fuera de la carpeta de publicables |
| `notes-autocommit` | SessionEnd | notas escritas que nunca llegan a git |
| `dirty-warn` | Stop | cerrar el turno con el repo de notas sucio (bloquea UNA vez) |
| `context-reminder` | SessionStart | recordatorios de contexto tras startup/resume/clear/compact |

Instalador: `npx claude-guardrails-kit init` copia los hooks a `<scope>/guardrails/`
(autocontenidos: en tiempo de ejecución no hay `npx` ni red), escribe una
`guardrails.config.json` de ejemplo si no existe y **fusiona** `settings.json` sin pisar
nada.

## No-objetivos

- No es un sandbox ni un firewall de comandos Bash (para eso, permisos y sandbox de Claude Code).
- Sin YAML (requeriría dependencia); JSON con comentarios no, JSON estricto.
- Sin statusline, sin hooks de HTTP/prompt/agent.
- Sin Windows nativo verificado en v0.1 (los hooks son Node, deberían funcionar; no probado).

## CLI

```
claude-guardrails-kit init [--scope user|project] [--hooks a,b,c] [--dry-run]
claude-guardrails-kit uninstall [--scope user|project]
claude-guardrails-kit list
```

`user` → `~/.claude/`, `project` → `./.claude/`. Cada entrada que escribimos en
`settings.json` lleva el comando `node "<dir>/guardrails/<hook>.mjs"`; esa ruta es la marca
con la que `init` es idempotente y `uninstall` quita solo lo nuestro. Se hace copia
`settings.json.bak` antes de escribir. Si `settings.json` existe y no es JSON válido,
`init` aborta (no lo toca).

## Contrato de los hooks

Formatos verificados en la documentación vigente:
<https://code.claude.com/docs/en/hooks> (consultada 2026-10-06).

- Entrada: JSON por stdin (`hook_event_name`, `tool_name`, `tool_input`, `cwd`,
  `stop_hook_active`, `source`…).
- Salida PreToolUse: `hookSpecificOutput.permissionDecision` = `allow|deny|ask|defer`,
  o exit 2 con el motivo por stderr.
- Stop: `{"decision":"block","reason":…}`; guardia anti-bucle `stop_hook_active`.
- Exit 0 = éxito (se lee el JSON); **exit 2 = bloqueo**; cualquier otro = error NO bloqueante
  (la acción procede). Por eso los gates usan exit 2 / `deny` explícito, nunca exit 1.

## Fallar cerrado

Regla: si un gate no puede decidir, **bloquea**. Payload ilegible, config ausente o
inválida, sección de config ausente, URL no parseable → deny/exit 2. Los hooks de
conveniencia que no pueden bloquear (SessionEnd) registran el error en el log y salen con
código ≠ 0 para que sea visible; `dirty-warn` sin `git` disponible bloquea una vez con un
mensaje explícito en vez de callar. `context-reminder` es informativo: ante config rota
avisa por stderr, no bloquea la sesión.

## Configuración (`guardrails.config.json`)

Se busca en `$CLAUDE_GUARDRAILS_CONFIG`, si no junto al hook. Solo se expande `~`.

```json
{
  "browserAllowlist": { "domains": ["example.com"], "allowLocalhost": true },
  "artifactGate": { "root": "~/artifacts" },
  "notes": { "repo": "~/notes", "push": false },
  "contextReminder": { "text": "…", "sources": ["startup", "resume", "clear", "compact"] }
}
```

## Competidores

Búsqueda 2026-10-06 (npm/web):

- `@aporthq/aport-agent-guardrails` — guardrails basados en políticas/"passport" con
  instalador `npx`, multi-framework. Más general y más pesado; no cubre allowlist de
  navegador local, artifacts ni autocommit de notas. (No auditado en detalle: `TODO(verificar)`.)
- "Claude Code Safety Guards" (studiomeyer.io, tienda) — ocho hooks PreToolUse contra
  errores irreversibles (comandos destructivos). Foco distinto. `TODO(verificar)` licencia y contenido: la
  página no se pudo leer de forma fiable.
- Tutoriales y gists sueltos de hooks individuales.

Diferencial: barandales de **flujo de trabajo personal** (navegador logueado, publicación,
notas) con configuración por archivo, instalador que fusiona sin pisar, cero dependencias
y pruebas que verifican exit codes y el caso de fallo cerrado. No compito en bloquear
`rm -rf`: eso lo cubren los permisos nativos.

## Nombre

`claude-guardrails-kit` — `npm view` → 404 (libre) el 2026-10-06. (`claude-code-guardrails`
está ocupado.)
