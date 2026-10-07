# claude-guardrails-kit

Hooks instalables para [Claude Code](https://code.claude.com/docs/en/hooks) que **fallan
cerrado**. Cero dependencias, Node ≥ 20, un solo archivo de configuración. [English](README.md)

Los hooks corren fuera del razonamiento del modelo, así que no puede esquivarlos
argumentando. El problema: un hook que asume una dependencia (`jq`, un archivo de lista, un
binario) y no la encuentra suele **dejar pasar todo en silencio**. Aquí, todo gate bloquea
cuando no puede decidir: payload ilegible, config ausente, URL imposible de parsear o `git`
ausente.

| Hook | Evento | Amenaza |
|---|---|---|
| `browser-allowlist` | `PreToolUse` | prompt injection desde un sitio hostil en un navegador con sesiones logueadas |
| `artifact-path-gate` | `PreToolUse` | publicar un archivo de fuera de la carpeta de publicables |
| `notes-autocommit` | `SessionEnd` | notas en disco que nunca llegan a git |
| `dirty-warn` | `Stop` | cerrar el turno con el repo de notas sucio o sin pushear |
| `context-reminder` | `SessionStart` | olvidar instrucciones fijas tras `/clear` o compactación |

## Instalar

```bash
npx claude-guardrails-kit init \
  --allow-domain example.com,github.com \
  --notes-repo ~/notas \
  --reminder "Lee siempre el índice del proyecto antes de editar."
```

`init` copia los hooks a `~/.claude/guardrails/`, crea `guardrails.config.json` si no existe y
**fusiona** `~/.claude/settings.json` sin pisar tus hooks, permisos ni claves; es idempotente y
deja un `settings.json.bak`. Si el JSON está roto, aborta sin tocarlo.

- Por defecto: `browser-allowlist` y `artifact-path-gate`. Los hooks de notas piden
  `--notes-repo`; el recordatorio pide `--reminder`.
- `--scope project` escribe `./.claude/settings.local.json` (lleva la ruta absoluta de `node`,
  no es para git). `--dry-run` no escribe nada. `uninstall` quita solo lo nuestro y conserva tu config.
- `--browser-matcher` define a qué tools MCP se aplica la lista (ajústalo al nombre de la tool
  de navegación de **tu** MCP).

## Configuración

Ver el ejemplo en [README.md](README.md#configuration). Las rutas aceptan `~` inicial.

## Qué hace cada hook

- **browser-allowlist**: solo `http(s)` hacia un dominio listado o sus subdominios. Bloquea
  (exit 2) `file:`, `example.com@evil.test`, `example.com.evil.test`, `127.evil.test`, llamadas
  sin URL y config ausente.
- **artifact-path-gate**: deniega publicar cualquier ruta real (con symlinks y `..`
  resueltos) fuera de `artifactGate.root`; el modelo lee el motivo y mueve el archivo.
- **notes-autocommit**: al terminar la sesión commitea lo sucio con mensaje genérico; push solo
  si `notes.push` es `true`; nunca `--no-verify`; no toca nada si hay cambios ya preparados.
- **dirty-warn**: bloquea el cierre del turno **una vez** para que el modelo commitee a mano.
  Sin `git` o con config rota, también bloquea una vez avisando.
- **context-reminder**: inyecta un texto fijo al iniciar/reanudar/limpiar/compactar.

## Desarrollo

```bash
npm test
npm run check
```

No es un sandbox ni un filtro de comandos Bash (para eso, los permisos de Claude Code).
Detalles de diseño en [DESIGN.md](DESIGN.md).

## Licencia

MIT © Marco Orta
