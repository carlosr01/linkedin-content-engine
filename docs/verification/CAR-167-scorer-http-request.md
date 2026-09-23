# CAR-167 — Scorer real vía HTTP Request en n8n DEV

> **Actualización CAR-184/CAR-167A:** la "Siguiente acción #1" de este documento (serializar el JSON Schema exacto en la petición) se implementó en `scripts/n8n-dev/prepare-update.mjs`. Detalle, determinación sobre soporte de `structured_outputs` en OpenRouter y estado de la reejecución en DEV: [CAR-184-schema-serialization.md](CAR-184-schema-serialization.md).

## Estado

**Experimento acotado ejecutado en DEV; resultado BLOCKED. WF01 sigue inactivo. PR #14 sigue en draft.**

[CAR-167](https://linear.app/carloshermesagent/issue/CAR-167) · hijo de [CAR-48](https://linear.app/carloshermesagent/issue/CAR-48/feat-implement-wf01-content-discovery) · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14).
Rama: `feat/car-48-wf01-content-discovery`. HEAD de partida: `ee2df91`.

## Qué cambió

El nodo `Score candidate with native LLM` dejó de ser la cadena `@n8n/n8n-nodes-langchain.chainLlm` + `lmChatOpenRouter` + `outputParserStructured` (SDK de LangChain) y pasó a ser un nodo nativo `n8n-nodes-base.httpRequest@4.5` que llama directamente a `https://openrouter.ai/api/v1/chat/completions`, seguido de un nodo `n8n-nodes-base.set@3.5` (`Parse OpenRouter scorer response`) que hace `JSON.parse(choices[0].message.content)` y emite `{output: <score>}` hacia el validador existente, sin tocar `Validate score and apply fixed threshold` más que para enriquecer `provenance` con `scorerImplementation`, `reasoningEffort`, `maxTokens`, `timeoutSeconds` y `retryCount`.

- Autenticación: credencial existente `openRouterApi` (`OpenRouter account`, mismo id que usaba el nodo LangChain), vía `predefinedCredentialType` — no se creó ni modificó ninguna credencial.
- Modelo: `deepseek/deepseek-v4-flash-0731`, el mismo ya configurado. Política de proveedor/modelo sin cambios.
- Nuevo: `reasoning: {effort: "low"}` en el body de la petición (antes ausente, el SDK LangChain no exponía este parámetro).
- `max_tokens`: 2000 (antes 1200 en las opciones del nodo LangChain).
- Timeout del nodo: 30000 ms, `retryOnFail` no configurado (`RETRY_COUNT=0`, sin reintentos automáticos del SDK que antes daba hasta 2 intentos).
- El nombre del nodo `Score candidate with native LLM` se preservó sin cambios; las conexiones de éxito/error existentes se conservaron.
- Se actualizó `scripts/n8n-dev/prepare-update.mjs` (generador determinista del workflow) y `scripts/n8n-dev/runtime-harness.cjs` (arnés de pruebas DEV) como código fuente; el JSON de workflow en el repo es, como siempre, un export releído y saneado, no escrito a mano.

## Por qué el arnés determinista se ajustó

El arnés fijaba antes directamente `Score candidate with native LLM` con `{output: score}` (el resultado ya final). Con el nuevo diseño de dos nodos, fijar así habría saltado por completo la lógica real de parseo. Se cambió el pin data para fijar únicamente la forma cruda de la respuesta del proveedor (`{choices: [{message: {content: JSON.stringify(score)}}]}`) en el nodo HTTP; el nodo `Parse OpenRouter scorer response` corre de verdad en los 12 casos, ejercitando el parseo real, no solo el caso en vivo.

## Resultado de los 12 casos deterministas

**12/12 PASS** (ejecuciones 125–136 del namespace `car48-1790146464796`). Ver [CAR-167-matrix.json](CAR-167-matrix.json). El caso `invalid-scorer-output` sigue fallando por el motivo correcto: el validador rechaza `relevanceScore=101` por schema, no por un fallo de parseo. La sustitución de `provenance.model` por `fixture-scorer-v1` en las pruebas fijadas se aplicó igual que antes (el nuevo campo `model` en la validación sigue siendo el primer y único `model:"..."` del código generado, sin colisión con el body del nodo HTTP).

## Resultado de las pruebas en vivo (una sola vez cada una, sin reintento)

Ver [CAR-167-live-results.json](CAR-167-live-results.json) y el resumen operativo en [CAR-48-provider-results.json](CAR-48-provider-results.json).

### A. `live-scorer` (ejecución 137) — FAIL

- **El bloqueador original de timeout queda resuelto en este caso:** el nodo `Score candidate with native LLM` respondió en **20 797 ms**, dentro del SLO de 30 s.
- Falla por una razón distinta: el modelo devolvió JSON válido pero con una forma que **no** es `content-score.schema.json`. En vez de `{candidateId, relevanceScore, brandAlignment, audienceValue, novelty, authority, opinionPotential, recommended, reason, contentPillar, recommendedFormat}`, devolvió `{candidateId, scores:{relevance,audienceValue,brandAlignment,novelty,sourceAuthority,originalPointOfView}, reasons:{...}, recommended, overallScore, notes}`.
- El nodo `Parse OpenRouter scorer response` parseó el JSON correctamente (20 ms); fue `Validate score and apply fixed threshold` quien rechazó el objeto por schema (`invalid_score`), enrutando a `Report candidate failure` como está diseñado. Cero persistencia parcial.
- La respuesta también incluyó un campo `reasoning` separado de `content` con razonamiento en texto libre, lo que confirma que `reasoning: {effort: "low"}` sí fue honrado por el proveedor.

### B. `live-catalog` (ejecución 138) — FAIL

- El nodo `Score candidate with native LLM` tardó **56 604 ms**, **por encima del SLO de 30 s**, pese a `options.timeout: 30000` en el nodo. La opción de timeout del HTTP Request nativo se documenta como el tiempo hasta que el servidor **empieza** a enviar las cabeceras de respuesta, no necesariamente el tiempo total hasta el cuerpo completo; para una respuesta de chat completions no-streaming, el proveedor puede mantener la conexión abierta generando la respuesta completa antes de emitir cualquier byte, y este caso sugiere que el límite configurado no acotó ese tiempo total como se esperaba. Se registra como hallazgo, sin modificar el timeout ni el modelo.
- El mismo problema de forma de salida se repitió: `{candidateId, scores:{...}, reasons:{...}, recommended, overallScore, notes}` en vez del schema exacto.
- Cero inserciones, cero duplicados, un `candidateFailures`. Sin persistencia parcial, sin activación del workflow.

## Diagnóstico (sin corregir en este experimento)

La implementación anterior (LangChain `chainLlm` + `outputParserStructured`) inyectaba automáticamente la definición del schema de salida en el contexto del modelo a través del parser de salida estructurada conectado por `ai_outputParser`. La nueva petición HTTP directa sólo envía `response_format: {type: "json_object"}` (modo JSON genérico) y describe el contrato en prosa dentro del prompt de sistema, pero **nunca serializa el JSON Schema real dentro del cuerpo de la petición**. El modelo, sin la forma exacta, produce su propia estructura razonable pero distinta. Esto es un defecto de construcción del prompt/petición, no una limitación del proveedor ni del modelo.

Por el protocolo de esta misión (una sola ejecución en vivo por caso, sin reintento para obtener PASS, sin relajar el validador ni el umbral), **no se corrigió el prompt ni se repitió la llamada**. Ambos hallazgos —la forma de salida y el timeout de `live-catalog`— quedan documentados para una iteración futura y explícitamente fuera del alcance de este experimento.

## Qué NO se hizo

No se aumentó el timeout, no se cambió `reasoning` a apagado, no se cambió de proveedor ni de modelo, no se aumentaron los reintentos, no se relajó el schema ni el umbral de 75, no se reintentó ningún caso en vivo fallido, no se activó WF01, no se publicó nada en LinkedIn, no se tocó PROD.

## Reproducción

Mismo procedimiento que CAR-48 (ver [CAR-48-wf01.md](CAR-48-wf01.md)), con `scripts/n8n-dev/prepare-update.mjs` y `scripts/n8n-dev/runtime-harness.cjs` ya actualizados en esta rama. `npm ci && npm run ci` pasan sin credenciales (37 tests locales, validación de repositorio, secretos). La semántica del workflow en DEV se comprobó ejecutando el arnés real, no con MCP (sigue sin exponerse en esta sesión).

## Siguiente acción

1. Incluir el JSON Schema exacto de `content-score.schema.json` dentro del cuerpo de la petición al proveedor (por ejemplo como `response_format: {type: "json_schema", json_schema: {...}}` si OpenRouter/el modelo lo soportan, o repitiéndolo explícitamente en el mensaje de sistema) para que la forma de salida sea determinista, y volver a intentar `live-scorer` una sola vez tras ese cambio.
2. Investigar por separado por qué `options.timeout=30000` del HTTP Request nativo no acotó los 56 604 ms observados en `live-catalog`, antes de asumir que el SLO de 30 s queda garantizado por el nodo.
3. No fusionar el PR ni activar WF01 hasta que ambos hallazgos se resuelvan y una prueba en vivo posterior (no una repetición de estas dos) pase.
