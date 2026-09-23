# CAR-184 / CAR-167A — Serializar el schema de content-score en el scorer HTTP de WF01

## Estado

**Delta de código fuente implementado y validado localmente. Actualización, reejecución de los 12 casos deterministas y reexportación en n8n DEV pendientes: esta sesión no tuvo acceso al contenedor DEV ni a MCP n8n.**

[CAR-184](https://linear.app/carloshermesagent/issue/CAR-184/car-167a-serialize-content-score-schema-into-wf01-openrouter-scorer) · hijo de [CAR-167](https://linear.app/carloshermesagent/issue/CAR-167) · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14). Rama: `feat/car-48-wf01-content-discovery`. Continúa directamente la acción "Siguiente acción #1" de [CAR-167-scorer-http-request.md](CAR-167-scorer-http-request.md).

## Qué cambió

`scripts/n8n-dev/prepare-update.mjs` (generador determinista del workflow, no el export) ahora:

- Conserva en memoria el JSON Schema `content-score` ya parseado (`schemaSources['content-score']`), el mismo objeto que se registra en AJV para validar la respuesta del scorer más abajo, en vez de descartarlo tras `ajv.addSchema`.
- Añade ese schema, serializado verbatim con `JSON.stringify`, al final del prompt de sistema que ya viaja en el cuerpo de la petición HTTP al nodo `Score candidate with native LLM` (`scorerSystemPrompt`), con una instrucción explícita de no añadir, omitir ni renombrar propiedades ni envolver el objeto.

No hay una segunda copia manual del schema: la única fuente es `schemas/content-score.schema.json`, leída una vez y reutilizada tanto para la validación AJV como para el cuerpo de la petición. `SCHEMA_AUTHORITY_SINGLE=YES`.

## Por qué no se usó `response_format: {type: "json_schema", ...}`

El objetivo pide preferir una petición con schema forzado por el proveedor cuando el path ya permitido lo soporte. Se consultó la documentación pública de OpenRouter sobre structured outputs (`https://openrouter.ai/docs/features/structured-outputs`): el soporte de `response_format:{type:"json_schema"}` es una capacidad por proveedor/modelo, listada explícitamente como el parámetro `structured_outputs` en `supported_parameters` de cada modelo, y los endpoints incompatibles devuelven error en vez de degradar silenciosamente.

La página de parámetros de `deepseek/deepseek-v4-flash-0731` en OpenRouter lista `response_format` entre sus parámetros soportados, pero **no** lista `structured_outputs`. Sin esa garantía documentada, activar `json_schema` en el modelo/proveedor ya permitido arriesgaba convertir el defecto de forma de salida (bug conocido, mitigable) en un error duro de la petición (regresión). Por eso se tomó la rama que el ticket permite explícitamente cuando el forzado no está soportado: serializar el schema exacto en las instrucciones de la petición, dejando `response_format:{type:"json_object"}` sin cambios. `HTTP_REQUEST_CARRIES_CANONICAL_SCHEMA=YES`.

Esta determinación es documental (lectura de la documentación pública de OpenRouter), no una llamada en vivo al scorer; no se ejecutó `live-scorer` ni `live-catalog` en esta sesión, conforme al punto 6 del ticket (esa aceptación en vivo espera a que vuelva la investigación de CAR-167B sobre la semántica del timeout de 56 604 ms observado en `live-catalog`).

## Qué NO cambió

Provider/modelo (`deepseek/deepseek-v4-flash-0731`), `reasoning.effort:"low"`, `max_tokens:2000`, timeout del nodo (30 000 ms), `retryOnFail` (sin configurar, `RETRY_COUNT=0`), el validador AJV y el umbral fijo de la política, el nombre del nodo `Score candidate with native LLM` y sus conexiones, y el estado `active:false`/`activeVersionId:null` de WF01. El hash de `promptVersion` en `provenance` sigue derivado únicamente de `prompts/content-scorer.md` sin el schema añadido (mismo cálculo que `lib/discovery/contracts.mjs`), para no invalidar su semántica de versión de prompt base.

## Validación ejecutada esta sesión

Sin credenciales, sin tocar DEV:

```bash
npm ci
npm run ci
```

Resultado: `format:check`, `validate:config`, `validate:schemas` (6 schemas), `validate:workflows` (1 export JSON, sólo forma/sintaxis) y `check:secrets` en PASS; **37/37 tests locales PASS** (mismo conteo que el estado previo documentado en [CAR-48-wf01.md](CAR-48-wf01.md), sin tests nuevos porque el cambio sólo afecta al generador que produce el export, no a `lib/discovery/*`). `node --check scripts/n8n-dev/prepare-update.mjs` confirma sintaxis válida.

## Qué falta (bloqueado por falta de acceso, no por diseño)

Esta sesión no tuvo el contenedor `n8n-dev.innovaq-ai.com` disponible para ejecutar el runtime harness (requiere `docker exec` dentro de ese host, ver `scripts/n8n-dev/runtime-harness.cjs`) ni MCP n8n expuesto. Por lo tanto, no se generó un nuevo export LIVE, no se corrió `prepare-update.mjs` contra un export real, no se guardó la actualización en DEV, no se releyó ni comparó (`export-verified.mjs`), y **no se reejecutaron los 12 casos deterministas** contra el nuevo `scorerSystemPrompt`. `workflows/discovery/wf01-content-discovery.json` permanece sin modificar en este commit a propósito: por la regla de n8n del repositorio, un export versionado debe originarse y verificarse contra n8n DEV, nunca escribirse desde memoria del modelo.

`DETERMINISTIC_CASES_PASS` y `READY_FOR_COMBINED_LIVE_ACCEPTANCE` del checklist de Done de CAR-184 quedan pendientes de una sesión con acceso real al contenedor DEV, siguiendo la reproducción ya documentada en [CAR-48-wf01.md](CAR-48-wf01.md) (`prepare-update.mjs` → import en DEV → `export-verified.mjs` → `runtime-harness.cjs test ... matrix`). Nótese que, como en CAR-167, el pin data del harness fija la respuesta cruda del proveedor en el propio nodo `Score candidate with native LLM`, por lo que los 12 casos deterministas no ejercitan el nuevo `scorerSystemPrompt` (bypasean la construcción del cuerpo de la petición); su PASS confirma que el resto del flujo sigue intacto, no que el schema añadido cambie el comportamiento del proveedor real. Esa confirmación sólo la dan `live-scorer` / `live-catalog`, explícitamente fuera de alcance de este ticket.

## Siguiente acción

1. Con acceso al contenedor DEV: regenerar el export vía `prepare-update.mjs`, importar, releer con `export-verified.mjs`, confirmar 12/12 en el harness, y commitear el `workflows/discovery/wf01-content-discovery.json` resultante junto con la evidencia (`CAR-184-matrix.json`/readback) en esta misma rama.
2. No ejecutar `live-scorer` ni `live-catalog` todavía; esperar el resultado de CAR-167B sobre el timeout de 56 604 ms.
3. No fusionar el PR ni activar WF01 como parte de esta entrega.
