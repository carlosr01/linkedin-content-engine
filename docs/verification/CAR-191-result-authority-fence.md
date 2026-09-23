# CAR-191 / CAR-186E — Fence de autoridad de resultado (admisión a 30 s) para el scorer de WF01

## Estado

**Implementado, releído y verificado en n8n DEV. 15/15 casos deterministas PASS (12 previos + 3 nuevos de frontera). WF01 sigue inactivo. No se ejecutó `live-scorer` ni `live-catalog`. PR #14 sigue en draft.**

[CAR-191](https://linear.app/carloshermesagent/issue/CAR-191/car-186e-implement-30s-scorer-result-authority-fence-after-explicit) · relacionado con [CAR-189](https://linear.app/carloshermesagent/issue/CAR-189/car-186d-determine-a-viable-absolute-deadline-mechanism-for-wf01-on), [CAR-167](https://linear.app/carloshermesagent/issue/CAR-167), [CAR-184](https://linear.app/carloshermesagent/issue/CAR-184) · hijo de [CAR-48](https://linear.app/carloshermesagent/issue/CAR-48/feat-implement-wf01-content-discovery) · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14). Rama: `feat/car-48-wf01-content-discovery`. HEAD de partida: `5370cf788281608d519d7407bafa89c445d2eb04`.

## Disparador y decisión

CAR-189 revisó de forma acotada y sólo lectura n8n 2.35.7 y no encontró un mecanismo nativo probado que aborte la petición HTTP autenticada del scorer exactamente a los 30 s; el propio `live-catalog` de [CAR-167-scorer-http-request.md](CAR-167-scorer-http-request.md) ya mostró que `options.timeout:30000` del nodo HTTP Request nativo no acotó una respuesta real que tardó 56 604 ms en completarse (el timeout del nodo limita el tiempo hasta el primer byte de cabecera, no el cuerpo completo en una respuesta no-streaming).

Carlos aceptó explícitamente el cambio de criterio de aceptación de CAR-186, de "deadline duro de ejecución total a/antes de 30 s" a: una respuesta evaluada en o después de `start+30000ms` **nunca** se vuelve autoritativa, aunque la petición HTTP subyacente termine más tarde. Esto no aborta el cómputo del proveedor ni garantiza que el nodo HTTP o el workflow completo terminen en 30 s; sólo garantiza que un resultado tardío no pueda parsear, validar, transicionar a SCORED/SELECTED, persistir ni publicar nada.

## Qué cambió

`scripts/n8n-dev/prepare-update.mjs` (generador determinista, no el export a mano):

- Nuevo nodo nativo `Record scorer start time` (`n8n-nodes-base.set@3.5`, ya usado en el resto del workflow), insertado inmediatamente antes de `Score candidate with native LLM`. Guarda `scorerStartedAtMs: $now.toMillis()` junto al resto del `$json` existente, sin tocar ningún campo del contrato de candidato.
- Nuevo nodo nativo `Scorer result still within admission window` (`n8n-nodes-base.if@2.3`, mismo tipo/versión que el resto de los branches del workflow), insertado inmediatamente después de la salida de éxito de `Score candidate with native LLM` y antes de `Parse OpenRouter scorer response`. Compara `{{ $now.toMillis() - $('Record scorer start time').item.json.scorerStartedAtMs }}` contra `30000` con el operador numérico `lt` (estrictamente menor). La rama verdadera (`<30000ms`) continúa al flujo de éxito existente sin cambios; la rama falsa (`>= 30000ms`) se enruta al mismo `Report candidate failure` que ya usan los demás fallos de este tramo.
- No se usó un Code node: ambas piezas son nodos nativos ya presentes en el tipo/versión live de DEV (`node()` valida esto contra el export de tipos, igual que el resto del generador), conforme a la preferencia del repositorio por nodos nativos sobre Code nodes.
- La ruta de error existente de `Score candidate with native LLM` (`onError:'continueErrorOutput'` → `Report candidate failure`) no se tocó: sigue cubriendo fallos reales de red/HTTP, independientemente del fence de admisión.

`scripts/n8n-dev/runtime-harness.cjs`: tres casos deterministas nuevos (`admission-before-boundary`, `admission-at-boundary`, `admission-after-boundary`) que fijan **sólo** el valor de `Record scorer start time` (nunca el timeout, reintentos o salida del propio nodo HTTP), retrasándolo `Date.now() - admissionOffsetMs` inmediatamente antes de invocar `WorkflowRunner.run`, para que el fence evalúe un tiempo transcurrido determinista contra el `$now` real de la ejecución. El caso "at" usa un offset de exactamente 30000 ms: dado que evaluar el propio fence consume tiempo real, un offset fijado en la frontera sólo puede medirse en la ejecución como en-o-después de la frontera, nunca antes — es la forma reproducible de probar el lado "at or after" fail-closed sin depender de igualdad exacta de reloj. Cada caso también verifica `scorerResponseParsedCount` (ejecuciones de `Parse OpenRouter scorer response`) para probar que un resultado rechazado nunca llega a parseo/validación/persistencia.

## Qué NO cambió

Provider/modelo (`deepseek/deepseek-v4-flash-0731`), `reasoning.effort:"low"`, `max_tokens:2000`, timeout del nodo HTTP (30 000 ms), `retryOnFail` (sin configurar, `RETRY_COUNT=0`), el validador AJV y el umbral fijo de la política, el schema de `content-score` y su única fuente de autoridad (CAR-184), el nombre y las conexiones existentes de `Score candidate with native LLM`, `Report candidate failure` sin diferenciar categoría de fallo (mismo diseño que los demás fallos de este tramo), y el estado `active:false`/`activeVersionId:null` de WF01.

## Validación local (sin credenciales, sin tocar DEV)

```bash
npm ci
npm run ci
```

`format:check`, `validate:config`, `validate:schemas`, `validate:workflows` y `check:secrets` en PASS; **37/37 tests locales PASS** (mismo conteo que el estado previo — este cambio sólo afecta al generador y al arnés DEV, no a `lib/discovery/*`). `node --check` confirma sintaxis válida en ambos scripts modificados.

## Verificación en n8n DEV

Con acceso al contenedor `linkedin-content-engine-n8n-dev-n8n-1` (n8n 2.35.7, Node 24.18.1, `N8N_HOST=n8n-dev.innovaq-ai.com`): export LIVE fresco de `MBjubZf00zHeukFo` (versión previa `17ad3b13-adf3-4771-9976-e92c299134d8`, 30 nodos) y de las 910 definiciones de tipos instaladas, `prepare-update.mjs` contra ese export real (32 nodos, tipos verificados contra el export live), import en el mismo workflow, y relectura exacta con `export-verified.mjs` — comparación estricta de `nodes`/`connections`/`settings`/`active`/`pinData` entre lo pretendido y lo persistido. Ver [CAR-191-readback.json](CAR-191-readback.json): nueva versión `c2b8cfc4-021b-4281-acc4-389cf66d9cc7`, `active=false`, `activeVersionId=null` antes y después, confirmado también con una consulta directa adicional tras correr el arnés.

`workflows/discovery/wf01-content-discovery.json` en este commit es, como siempre, el export saneado releído desde DEV — no se escribió desde memoria del modelo.

### Matriz determinista — 15/15 PASS

[CAR-191-matrix.json](CAR-191-matrix.json), namespace `car48-1790206028607`, ejecuciones 185–199. Los 12 casos previos (`valid-source`, `duplicate-url`, `duplicate-hash`, `invalid-item`, `429`, `5xx`, `timeout`, `partial-source-failure`, `invalid-scorer-output`, `long-retry-after`, `atomic-url-conflict`, `atomic-hash-conflict`) siguen PASS sin cambios de comportamiento. Los tres casos nuevos:

| Caso                        | Offset de inicio fijado | Resultado                                                                      |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `admission-before-boundary` | 5 000 ms                | Aceptado: `inserted=1`, `scorerResponseParsedCount=1` — camino normal intacto. |
| `admission-at-boundary`     | 30 000 ms               | Rechazado: `inserted=0`, `candidateFailures=1`, `scorerResponseParsedCount=0`. |
| `admission-after-boundary`  | 45 000 ms               | Rechazado: `inserted=0`, `candidateFailures=1`, `scorerResponseParsedCount=0`. |

`scorerResponseParsedCount=0` en los dos casos rechazados confirma estructuralmente el requisito "no parsing/validation after expiry": `Parse OpenRouter scorer response` nunca se ejecuta para esos items, y por ser una cadena estrictamente secuencial, tampoco `Validate score and apply fixed threshold` (transición SCORED/SELECTED) ni `Persist candidate bundle atomically`. `RETRY_COUNT=0` no cambió, así que tampoco hay reintento del fence. La relectura de bundles persistidos ([CAR-191-persistence.json](CAR-191-persistence.json), vía `verify-persistence.mjs`) confirma exactamente 5 inserts en esta corrida (`valid-source`, `429`, `5xx`, `partial-source-failure`, `admission-before-boundary`), ninguno correspondiente a los dos casos de frontera/expiración, y los 5 con `provenance.model="fixture-scorer-v1"` (nunca atribuidos al modelo real).

El workflow guardado se releyó como inactivo tanto por la propia aserción del arnés (`WORKFLOW_ACTIVATED` habría abortado la corrida) como por una exportación adicional después de la prueba.

## Qué NO se hizo

No se ejecutó `live-scorer` ni `live-catalog`: el fence de admisión es independiente de la forma de salida del proveedor real (bloqueador documentado en CAR-167/CAR-184) y de cualquier reintento de esos casos en vivo; ejecutarlos no era parte del criterio de aceptación de este ticket y habría mezclado dos investigaciones. No se activó WF01, no se cambió el timeout del nodo, el modelo, `reasoning`, `max_tokens`, reintentos, umbral ni schema. No se fusionó el PR.

## Siguiente acción

1. Cuando se retome `live-scorer`/`live-catalog` (pendiente de la corrección de forma de salida y del hallazgo de timeout de CAR-167), el fence de admisión ya estará activo en esa corrida — su primer efecto real sobre tráfico en vivo se observará ahí, no en este ticket.
2. No fusionar el PR ni activar WF01 como parte de esta entrega.
