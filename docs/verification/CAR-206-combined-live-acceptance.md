# CAR-206 — Aceptación combinada en vivo de WF01 (live-scorer + live-catalog) tras CAR-197

## Estado

**PASS. Un intento de cada caso, cero reintentos. WF01 sigue inactivo. No se tocó PROD, no se activó, no se publicó.**

[CAR-206](https://linear.app/carloshermesagent/issue/CAR-206) · hijo de [CAR-167](https://linear.app/carloshermesagent/issue/CAR-167) · relacionado con [CAR-191](https://linear.app/carloshermesagent/issue/CAR-191), [CAR-197](https://linear.app/carloshermesagent/issue/CAR-197) (Done, revisión independiente PASS), [CAR-48](https://linear.app/carloshermesagent/issue/CAR-48) · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14). Rama: `feat/car-48-wf01-content-discovery`. HEAD autorizado: `4b8b89ab37142d27b6bae4450c99bc492240ae5b` (CI 36037652547 `success`).

## Autorización

Aprobación explícita de Carlos: un intento de `live-scorer` y un intento de `live-catalog`, cero reintentos, usando la credencial OpenRouter ya existente y adjunta a WF01 (no se creó ni modificó ninguna credencial), contra el workflow DEV existente `MBjubZf00zHeukFo`.

## Preflight

- Exact-head: local y remoto en `4b8b89a...`, working tree limpio, CI `success` en ese SHA exacto.
- DEV: contenedores `n8n`/`postgres` healthy, `N8N_HOST=n8n-dev.innovaq-ai.com`.
- Sin drift: `MBjubZf00zHeukFo` seguía en `versionId=a82350bd-05fb-47f3-b358-2fb8fcdcedc6`, `active=false`, `activeVersionId=null` — idéntico al estado dejado por CAR-197.
- Puerto 5681 libre, sin procesos huérfanos del arnés.

## Qué ejecuta cada caso (verificado en el código del arnés, no asumido)

- `live-scorer`: `pinData={}` — el nodo `Score candidate with native LLM` corre real (sin pin), una llamada real a OpenRouter vía la credencial existente. La fuente sigue siendo el servidor de fixtures interno (`http://127.0.0.1:18848/live-scorer`), no una fuente externa real.
- `live-catalog`: además usa el catálogo de fuentes real configurado (`liveConfig.sources`) con `maximumCandidatesPerRun=1` — una llamada real de fetch RSS más una llamada real a OpenRouter, acotada a un máximo de un candidato.

## Resultados

[CAR-206-combined-live-acceptance.json](CAR-206-combined-live-acceptance.json)

| Caso           | Execution ID | Tiempo scorer | Estado | Insertados | Duplicados | Fallos candidato | `scorerResponseParsedCount` |
| -------------- | ------------ | ------------- | ------ | ---------- | ---------- | ---------------- | --------------------------- |
| `live-scorer`  | 232          | 8045 ms       | PASS   | 1          | 0          | 0                | 1                           |
| `live-catalog` | 233          | 8743 ms       | PASS   | 1          | 0          | 0                | 1                           |

Ambos tiempos de ejecución del scorer están muy por debajo del límite de admisión de CAR-191 (30 000 ms) — caso A ("antes de la frontera") en ambos: el fence de CAR-191 evaluó el resultado como autoritativo, `Parse OpenRouter scorer response` corrió, la validación de score pasó, y el bundle se persistió por el camino normal.

No recurrió el defecto de CAR-197: ningún "invalid syntax", ambas ejecuciones con `executionStatus=success` y `pinnedNodes=[]` (nada fijado — el nodo `Build scorer request body` y el `httpRequest` del scorer corrieron de verdad, incluyendo la construcción real del `jsonBody` con el schema canonical embebido).

## Verificación posterior de seguridad

Relectura de `MBjubZf00zHeukFo` después de ambos intentos: `active=false`, `activeVersionId=null`, `versionId` sin cambios (`a82350bd-...` — las ejecuciones manuales del arnés no crean una nueva versión guardada del workflow). Coincidencia única por nombre (`WF01__content_discovery`) en toda la instancia: sin workflow duplicado.

## Clasificación final

```
LIVE_SCORER_FULL_PASS=YES
LIVE_CATALOG_FULL_PASS=YES
DELIMITER_FAILURE_RECURRED=NO
CAR191_BEHAVIOR_CORRECT=YES
PROVIDER_OUTPUT_CONTRACT=PASS
WF01_ACTIVE=NO
PROD_MUTATION=NO
PUBLICATION=NO
COMBINED_LIVE_ACCEPTANCE=PASS
```

## Qué NO se hizo

No se activó WF01, no se tocó PROD, no se publicó nada, no se creó ni modificó ninguna credencial, no se repitió ningún caso, no se cambió provider/modelo/reasoning/max_tokens/timeout/reintentos/validador/umbral/semántica de CAR-191. No se fusionó el PR.

## Nota operativa

Los archivos crudos de salida del arnés (`/tmp/live-scorer.json`, `/tmp/live-catalog.json` dentro del contenedor DEV) se borraron antes de copiarlos fuera del contenedor. No se perdió información relevante para la aceptación: cada registro `CAR48_CASE=...` completo (idéntico al objeto que habría quedado en el archivo, salvo el envoltorio `namespace`/`beforeCount` de la corrida, irrelevante para los casos `live-*` ya que no usan el servidor de fixtures por namespace) se capturó íntegro desde stdout y es el que se transcribe en [CAR-206-combined-live-acceptance.json](CAR-206-combined-live-acceptance.json). No se volvió a ejecutar ningún caso para "recuperar" el archivo, conforme a la regla de cero reintentos.

## Siguiente paso

CAR-191 se cierra con esta evidencia en vivo. CAR-206 se cierra. El siguiente portón es una revisión independiente final de PR antes de que Carlos apruebe el merge — no autorizada por esta entrega.
