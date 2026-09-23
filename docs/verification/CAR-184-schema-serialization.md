# CAR-184 / CAR-167A — Serializar el schema de content-score en el scorer HTTP de WF01

## Estado

**Actualizado, releído y verificado en n8n DEV. 12/12 casos deterministas PASS. WF01 sigue inactivo. No se ejecutó `live-scorer` ni `live-catalog` (fuera de alcance de este ticket). PR #14 sigue en draft.**

> Continuación con acceso a DEV (misma rama, `ONE_BRANCH_ONE_WRITER=YES`): se regeneró el export vía `prepare-update.mjs`, se importó en `MBjubZf00zHeukFo`, se releyó con `export-verified.mjs` ([CAR-184-readback.json](CAR-184-readback.json)) y se corrieron los 12 casos deterministas ([CAR-184-matrix.json](CAR-184-matrix.json), ejecuciones 139–150). `workflowVersion` pasó de `b8b536e5-d89e-42d2-9e10-b0b15ab3a5a3` a `e9c16062-1f52-4251-b923-8d6c4f4c3821`; `active=false`, `activeVersionId=null` antes y después. `prepare-update.mjs` necesitó un ajuste de compatibilidad no relacionado con el diseño: el export LIVE de DEV ya reflejaba el nodo `httpRequest` de CAR-167 (no la cadena LangChain original), así que la extracción de `scorerModelId`/`scorerCredential` ahora reconoce ambas formas del export en vez de asumir sólo la anterior — necesario para que el generador sea ejecutable de nuevo, sin tocar el delta CAR-184 en sí ni ningún parámetro fuera de alcance.

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

## Qué se completó en esta continuación

Con acceso al contenedor DEV: export LIVE fresco, `prepare-update.mjs` contra ese export real, import en `MBjubZf00zHeukFo`, relectura y comparación exacta con `export-verified.mjs` (nodes/connections/settings/active/pinData), y los 12 casos deterministas del arnés, todos PASS. `workflows/discovery/wf01-content-discovery.json` en este commit es, como siempre, el export saneado releído desde DEV — no se escribió desde memoria del modelo.

Como en CAR-167, el pin data del harness fija la respuesta cruda del proveedor en el propio nodo `Score candidate with native LLM`, por lo que los 12 casos deterministas no ejercitan el nuevo `scorerSystemPrompt` con el schema embebido (bypasean la construcción real del cuerpo de la petición). Su PASS confirma que el resto del flujo (parseo, validación, persistencia, dedupe, enrutamiento de errores) sigue intacto tras el cambio; **no** confirma que el schema embebido efectivamente corrija la forma de salida del proveedor real. Esa confirmación sólo la da `live-scorer`/`live-catalog`, explícitamente fuera de alcance de este ticket (`LIVE_SCORER_RUN=NO`, `LIVE_CATALOG_RUN=NO`).

## Siguiente acción

1. No ejecutar `live-scorer` ni `live-catalog` todavía; esperar el resultado de CAR-167B sobre el timeout de 56 604 ms observado en `live-catalog` antes de una aceptación en vivo combinada.
2. Cuando ambos (schema embebido + hallazgo del timeout) estén listos para probarse juntos: ejecutar `live-scorer` y `live-catalog` una sola vez cada uno, sin reintento, siguiendo el mismo protocolo que CAR-167.
3. No fusionar el PR ni activar WF01 como parte de esta entrega.
