# CAR-48 — paquete reproducible de WF01

## Estado y alcance

**Implementación local verificada; integración n8n DEV bloqueada. CAR-48 no está completado.**

Issue: [CAR-48](https://linear.app/carloshermesagent/issue/CAR-48/feat-implement-wf01-content-discovery).
Orquestador: Orca. Repositorio canónico: `carlosr01/linkedin-content-engine`.
Base: `45ec94dac5b0d66b1cf40616174a408034658a77`.
Rama: `feat/car-48-wf01-content-discovery`.

La sesión inicial abrió un checkout de `hermes-agent`. Se preparó un checkout aislado del repositorio correcto; Hermes no se modificó.

| Evidencia                                 | Estado                                     |
| ----------------------------------------- | ------------------------------------------ |
| Workflow ID / versión DEV                 | **NO DISPONIBLE: no creado ni consultado** |
| Definiciones actuales de nodos DEV        | **PENDIENTE**                              |
| Persistencia y relectura del workflow DEV | **PENDIENTE**                              |
| Pruebas de ejecución n8n DEV              | **PENDIENTE**                              |
| Export sanitizado de n8n                  | **NO GENERADO**                            |
| Paquete local y pruebas de contrato       | **PASS**                                   |
| Scheduler, drafting, approval, publishing | **Ausentes**                               |

El catálogo de herramientas de esta sesión no expone n8n MCP. La búsqueda de plugins n8n no devolvió resultados y la configuración local de Codex no registra servidores MCP. El usuario autorizó habilitar la conexión DEV, pero esa autorización no establece conectividad. Orca debe exponer el MCP DEV existente; no hacen falta secretos por chat. No se alteró la configuración del servidor ni se creó otro scheduler.

El comentario de alcance del issue permite detener la implementación en un paquete reproducible cuando falta acceso DEV. No se fabricó un export con versiones de nodos recordadas. El PR debe permanecer en draft hasta completar las verificaciones live.

## Skills oficiales consultadas

Se consultó el checkout oficial [n8n-io/skills](https://github.com/n8n-io/skills/tree/180b8415e3b73f78828cfa01e908e67f89f2a139), SHA `180b8415e3b73f78828cfa01e908e67f89f2a139`:

- `using-n8n-skills-official`;
- `n8n-workflow-lifecycle-official`;
- `n8n-error-handling-official`;
- `n8n-code-nodes-official`.

Lectura directa de sus `SKILL.md`; esta sesión no tiene un invocador de Skills n8n. Esta consulta no sustituye `get_node_types` ni validación semántica live. El paquete es JavaScript de referencia local, **no código para pegar como un Code node monolítico**. En DEV hay que priorizar nodos nativos y expresiones, y justificar cualquier Code node después de inspeccionar capacidades.

## Reproducción sin credenciales

Requiere Node.js 22 o superior, como el repositorio:

```bash
npm ci
npm run ci
npm run discovery:replay
```

El replay no hace llamadas de red: usa una fuente sintética, un scorer explícitamente simulado y un archivo temporal. Primera ejecución: `discovered=1, scored=1, selected=1`. Reabre el store y repite: `duplicate=1, scored=0`; mismo candidate ID. Elimina sólo su directorio temporal al terminar.

Validación local ejecutada con Node.js `v24.21.0`:

- 34 tests pasan, incluidos 24 nuevos de discovery.
- Formato, tres configuraciones y seis schemas: PASS.
- Escaneo de secretos del repositorio: PASS.
- Validador de workflows: PASS con **cero exports**, no evidencia de n8n.
- Replay: PASS, `OFFLINE_FIXTURES_ONLY`, `liveDevVerified=false`.

`npm ci`/`npm audit` detectaron una vulnerabilidad high preexistente en la dependencia transitiva `fast-uri` del lockfile base. No se cambiaron dependencias en CAR-48. Revisarla en mantenimiento antes de usar este paquete con tráfico real; el replay no accede a URLs externas.

## Contrato ejecutable local

`lib/discovery/run.mjs` expone `runDiscovery`. Recibe exclusivamente configuración confiable y adaptadores inyectados:

- `environment`: únicamente `development`;
- `catalog`, `policy`: validados con los validadores existentes;
- `brandContext`, `model`, `correlationId`;
- `fetchPage({ source, cursor, limit, signal })` devuelve `{ items, nextCursor? }`;
- cada item tiene `{ url, title, text, author?, publishedAt?, language? }`;
- `score({ model, messages, signal })` devuelve JSON conforme a `content-score.schema.json`;
- `store.find(candidate)` y `store.commit({ source, candidate, score, provenance })`;
- reloj y espera inyectables para pruebas deterministas.

`fetchPage` y `score` **no tienen implementaciones HTTP/LLM en este paquete**. Los fixtures no prueban extracción RSS, autenticación ni comportamiento de un proveedor real. Los adaptadores live deben respetar cancelación, limitar bytes antes de parsear, rechazar destinos privados y redirecciones fuera de la allowlist, tratar el cursor como dato opaco y nunca hacer fetch de una URL escogida por el modelo. El catálogo revisado es la única autoridad de destinos; `canonicalUrl` no es una defensa SSRF.

Las fuentes habilitadas se ordenan por prioridad e ID. Se excluye `manual_url` (corresponde a WF02). Máximos: 5 fuentes, 2 páginas/fuente, 25 items/fuente y 25 items/ejecución. Un item inválido o duplicado también consume presupuesto. Una página que excede el límite solicitado se rechaza completa. Los límites pueden reducirse; no aumentarse por encima de esos máximos. El ejemplo del repositorio habilita sólo OpenAI News para discovery automático; los fixtures usan únicamente `example.com` como identificador, sin visitarlo.

Cada intento de fetch/scoring tiene timeout de 30 segundos y hasta 3 intentos. Se reintentan sólo errores `DiscoveryError` marcados transitorios por el adaptador confiable. El adaptador traduce 429, 5xx y errores de red a códigos; no se inspecciona texto externo para decidir retry. Espera base: 1 segundo; backoff exponencial acotado a 30 segundos. `Retry-After` mayor que el presupuesto difiere la fuente, nunca se acorta para reintentar prematuramente. Los tests inyectan esperas sin reloj real. No hay timers recurrentes, cron ni activación de workflows.

## Normalización e identidad

- URL absoluta HTTP(S), sin usuario/contraseña. Se elimina fragmento y sólo parámetros `utm_*`, `fbclid`, `gclid`.
- Se conservan protocolo, path, trailing slash, parámetros funcionales y su orden para evitar colisiones semánticas.
- Título y texto: NFC, whitespace colapsado y trim. Máximos: 2.000 y 100.000 caracteres. No se trunca silenciosamente.
- Hash v1: SHA-256 UTF-8 de `JSON.stringify([normalizedTitle, normalizedText])`.
- IDs de fuente y candidato: prefijo más SHA-256 de URL canónica.
- Ausencia de autor/fecha queda en `null`; fecha presente debe ser válida y se convierte a UTC.
- Idioma y topics provienen del catálogo; `auto` exige un idioma válido en el item. No se inventan traducciones ni resúmenes: `rawSummary` conserva el texto normalizado.
- Cada fuente y candidato se valida contra los schemas existentes antes del scoring.

Se considera duplicado si coincide **URL canónica O content hash**, no sólo si coinciden ambos. Una URL conocida con texto actualizado no crea una revisión; la actualización editorial queda fuera de WF01. Contenido igual con título diferente tiene hash diferente según la representación documentada. No se afirma deduplicación semántica.

## Scoring y frontera de confianza

Se usa `prompts/content-scorer.md` como mensaje system inmutable. El candidato se serializa bajo `untrustedCandidate` en un mensaje de datos; no se interpolan instrucciones de fuente en system ni existen tools o acciones de publicación. El adaptador LLM live también deberá carecer de tools. La separación de mensajes no garantiza por sí sola resistencia semántica del modelo: los tests prueban los límites de autoridad y persistencia, no la calidad editorial de un LLM real.

Salida inválida, campos extra, candidate ID ajeno o números fuera de rango se rechazan sin reparación ni coerción y sin escribir registros parciales. La política existente establece 75 como umbral; `recommended` no tiene autoridad. Estados finales posibles: `SCORED` o `SELECTED`. `SELECTED` termina en persistencia y no dispara drafting ni scheduling.

Provenance registra contract version, correlation ID, modelo declarado por el adaptador, SHA-256 del prompt, versión/hash de política, hash del contexto de marca y fecha de generación. No se registra razonamiento oculto. Los diagnósticos contienen códigos de allowlist y etapa, nunca mensajes de errores externos ni cuerpos de fuente.

## Persistencia y recuperación

`FileCandidateStore` es un adaptador **local de referencia**, no la selección del backend DEV (ADR-004 sigue vigente). Guarda fuente, candidato, score y provenance en una sola sustitución atómica del archivo; comprueba de nuevo la unicidad bajo lock exclusivo. Los tests cubren lectura tras reinicio, colisión durante commit y dos writers concurrentes. Un writer puede recibir `storage_busy`; se informa y se reejecuta después.

Archivos con modo 0600 y directorios nuevos con 0700. Un snapshot corrupto falla cerrado. Un crash puede dejar un `.lock`: no se roba ni borra automáticamente. El operador debe comprobar que no hay writer activo antes de recuperar ese lock. No se garantiza durabilidad frente a pérdida eléctrica ni idoneidad para NFS/volúmenes distribuidos. El snapshot completo se lee y valida en cada operación: sólo adecuado para el replay/local, no para crecimiento indefinido. El backend DEV deberá demostrar unicidad y recuperación bajo su modelo real de concurrencia.

## Matriz de pruebas pendiente en DEV

Repetir los escenarios locales mediante ejecución manual y datos sintéticos en el entorno confirmado DEV:

| Escenario                        | Resultado esperado                                                   |
| -------------------------------- | -------------------------------------------------------------------- |
| Fuente correcta                  | Registros schema-valid persistidos y lectura independiente           |
| URL con tracking / hash repetido | Mismo candidato; sin scoring repetido ni inserts duplicados          |
| 429 y 5xx transitorios           | Retry limitado; respeto de Retry-After                               |
| Retry-After excesivo             | Fuente diferida, sin retry prematuro                                 |
| Timeout y agotamiento            | Fallo observable; resto de fuentes continúa                          |
| JSON/scoring inválido            | Sin registros parciales ni estado superior a SELECTED                |
| Fuente fallida + fuente correcta | Resultado parcial y candidato de la segunda fuente                   |
| Texto con instrucciones hostiles | System intacto; sin acceso a tools, política ni estados de autoridad |
| Dos ejecuciones simultáneas      | Un candidato por URL/hash; conflicto recuperable                     |
| Fallo de persistencia y replay   | Sin pérdidas silenciosas ni duplicados                               |

## Siguiente acción de Orca

1. Exponer el MCP de DEV documentado en `issue-1-n8n-dev-mcp.md`; no conectar PROD.
2. Inspeccionar capacidades, workflows existentes y definiciones live; consultar las skills oficiales aplicables a los nodos elegidos. Resolver ubicación e integración existente antes de crear WF01.
3. Implementar adapters y persistencia DEV con nodos nativos verificados. Sin scheduler nuevo ni acciones de draft/approval/publication. Mantener workflow inactivo.
4. Validar semántica y ejecutar la matriz manual con fixtures y credenciales exclusivamente DEV.
5. Releer workflow guardado y comparar nodos, conexiones, errores, límites, estado inactivo y ausencia de capacidades prohibidas. Registrar ID/version reales.
6. Exportar desde esa relectura; retirar credenciales, IDs de instancia, URLs privadas y pin data sensible; comprobar nuevamente el export sanitizado. Guardarlo bajo `workflows/discovery/` según las convenciones del repositorio.
7. Ejecutar CI, añadir evidencia DEV y export al mismo PR. Sólo entonces solicitar revisión para completar CAR-48.
