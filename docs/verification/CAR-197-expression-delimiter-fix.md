# CAR-197 — Fix de colisión de delimitadores de expresión en el `jsonBody` del scorer de WF01

## Estado

**Implementado, releído y verificado en n8n DEV. 15/15 casos deterministas PASS. WF01 sigue inactivo. No se ejecutó `live-scorer` ni `live-catalog`. PR #14 sigue en draft.**

[CAR-197](https://linear.app/carloshermesagent/issue/CAR-197) · hijo de [CAR-167](https://linear.app/carloshermesagent/issue/CAR-167) · relacionado con [CAR-184](https://linear.app/carloshermesagent/issue/CAR-184), [CAR-191](https://linear.app/carloshermesagent/issue/CAR-191) · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14). Rama: `feat/car-48-wf01-content-discovery`. HEAD de partida (implementación local): `e55587ceb982e119502eacf740df86dd5af141db`.

## Causa raíz

CAR-184 serializa el canonical `schemas/content-score.schema.json` con `JSON.stringify` dentro de `scorerSystemPrompt`, y CAR-184 empalmó ese prompt directamente como texto literal dentro de la expresión `={{ ... }}` del `jsonBody` del nodo `httpRequest` del scorer. `JSON.stringify` no escapa `{`/`}`, así que cualquier cierre de objeto anidado del schema (p. ej. el final de un bloque `"properties": {...}`) puede aparecer como un `"}}"` literal dentro del texto fuente de esa expresión, antes de su delimitador de cierre real. El parser de expresiones de n8n interpreta ese `"}}"` como el cierre de la expresión, no como contenido de la cadena JSON que se está construyendo — resultado: "invalid syntax" en ejecución. La matriz de 12-15 casos existente nunca lo detectó porque esos casos fijan (`pin`) la salida del nodo del scorer y nunca evalúan su expresión `jsonBody`.

## Qué cambió

`scripts/n8n-dev/prepare-update.mjs` (generador determinista):

- Nuevo nodo `Build scorer request body` (`n8n-nodes-base.code@2`), insertado entre `Record scorer start time` y `Score candidate with native LLM`. Construye el cuerpo de la petición (`model`, `temperature`, `max_tokens`, `response_format`, `reasoning`, `messages`) como un objeto JS plano y lo deja en `$json.scorerRequestBody`. El campo `jsCode` de un Code node se ejecuta como JavaScript ordinario — no se escanea por delimitadores `{{ }}` — así que empalmar JSON serializado ahí no tiene el mismo riesgo (técnica que este archivo ya usaba en otros nodos, p. ej. la validación de score).
- El nodo `httpRequest` del scorer ahora usa `jsonBody: ={{ JSON.stringify($json.scorerRequestBody) }}` — una expresión corta y fija que nunca puede contener un `"}}"` embebido, porque ya no lleva el schema ni el prompt como texto fuente.
- `scripts/validate-workflows.mjs`: nueva función `findExpressionDelimiterRisks`, genérica y no ligada al schema de content-score — detecta cualquier expresión `={{ ... }}` cuyo contenido interno tenga un `"}}"` literal antes del cierre, en cualquier parámetro de cualquier nodo, en cualquier export del repositorio. Corre como parte de `validate:workflows`.
- 5 tests de regresión nuevos en `tests/workflows/expression-delimiter.test.mjs`: reproducen el defecto exacto contra el schema/prompt/policy reales con la construcción antigua de CAR-184, confirman que la construcción nueva no lo dispara, prueban el detector contra un caso contrivado y contra expresiones benignas (sin falsos positivos), y verifican por hash que el schema reconstruido a través del nuevo Code node es byte-idéntico al canonical.

## Qué NO cambió

Autoridad única del schema (`schemas/content-score.schema.json`, sin segunda copia), provider/modelo (`deepseek/deepseek-v4-flash-0731`), `reasoning.effort:"low"`, `max_tokens:2000`, timeout del nodo HTTP (30 000 ms), `RETRY_COUNT=0`, el validador AJV y el umbral fijo de la política, el fence de admisión de CAR-191 (`Record scorer start time` + `Scorer result still within admission window`, frontera `<30000ms`), y el estado `active:false`/`activeVersionId:null` de WF01.

## Validación local (sin credenciales, sin tocar DEV)

```bash
npm ci
npm run ci
```

`format:check`, `validate:config`, `validate:schemas`, `validate:workflows` y `check:secrets` en PASS; **42/42 tests locales PASS** (37 previos + 5 nuevos de CAR-197).

## Verificación en n8n DEV

Con acceso al contenedor `linkedin-content-engine-n8n-dev-n8n-1` (n8n 2.35.7, `N8N_HOST=n8n-dev.innovaq-ai.com`), vía SSH a la VPS existente (no se creó Colima, no se creó una API key, no se creó una segunda instancia): export LIVE fresco de `MBjubZf00zHeukFo` (versión previa `c2b8cfc4-021b-4281-acc4-389cf66d9cc7`, 32 nodos, aún con el defecto de CAR-184 presente en el `jsonBody`) y de las 910 definiciones de tipos instaladas, `prepare-update.mjs` contra ese export real (33 nodos, tipos verificados contra el export live), import en el mismo workflow (`--activeState=false`; se confirmó una sola coincidencia por nombre tras el import, sin duplicado), y relectura exacta con `export-verified.mjs` — comparación estricta de `nodes`/`connections`/`settings`/`active`/`pinData` entre lo pretendido y lo persistido. Ver [CAR-197-readback.json](CAR-197-readback.json): nueva versión `a82350bd-05fb-47f3-b358-2fb8fcdcedc6`, `active=false`, `activeVersionId=null` antes y después.

`workflows/discovery/wf01-content-discovery.json` en este commit es, como siempre, el export saneado releído desde DEV — no se escribió a mano ni desde memoria del modelo. Con el fix aplicado, `npm run validate:workflows` pasa de fallar (defecto detectado por `findExpressionDelimiterRisks` contra el export pre-fix) a PASS.

Se confirmó adicionalmente sobre la relectura persistida (no sólo sobre el generador local): el `jsonBody` del scorer en DEV es exactamente `={{ JSON.stringify($json.scorerRequestBody) }}`; el `jsCode` de `Build scorer request body`, ejecutado con un candidato de prueba, produce un cuerpo cuyo schema embebido reconstruye por hash SHA-256 idéntico al canonical; y el fence de CAR-191 sigue presente sin modificar (`Scorer result still within admission window` sigue comparando el elapsed contra `30000` con `lt`).

### Matriz determinista — 15/15 PASS

[CAR-197-matrix.json](CAR-197-matrix.json), namespace `car48-1790272362392`, ejecuciones 217–231. Todos los casos existentes (los 12 originales más los 3 de frontera de admisión de CAR-191) siguen PASS sin cambio de comportamiento — en particular, `Build scorer request body` se ejecuta de verdad en cada corrida (no está en `pinnedNodes`, sólo `Score candidate with native LLM` lo está), así que la matriz ejercita la construcción real del `jsonBody`, no una simulación. Tras el arnés, una exportación adicional confirmó `active=false`, `activeVersionId=null`, `versionId` sin cambios respecto al import (`a82350bd-...`).

## Qué NO se hizo

No se ejecutó `live-scorer` ni `live-catalog` — quedan sujetos a una aprobación explícita y separada de aceptación combinada en vivo, con un intento cada uno y sin reintento, según el propio criterio de este ticket. No se activó WF01, no se cambió el modelo, `reasoning`, `max_tokens`, timeout, reintentos, umbral ni el schema. No se creó una segunda rama, un segundo PR ni una segunda instancia/API key de n8n. No se fusionó el PR ni se marcó "Ready for review".

## Siguiente acción

1. Aprobación explícita y separada de Carlos para un intento combinado de `live-scorer` + `live-catalog` (cero reintentos), que sigue bloqueado por los hallazgos previos de forma de salida/timeout documentados en CAR-167/CAR-184 hasta que se confirme que ya no aplican con este transporte corregido.
2. No fusionar el PR ni activar WF01 como parte de esta entrega.
