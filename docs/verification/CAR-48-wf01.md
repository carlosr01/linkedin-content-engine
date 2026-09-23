# CAR-48 — WF01 en n8n DEV

> **Actualización CAR-167:** el scorer se reimplementó como HTTP Request nativo (antes LangChain `chainLlm`). El bloqueador de timeout de 30 s se resolvió en el caso `live-scorer` (20 797 ms), pero ambas pruebas en vivo siguen en BLOCKED por una forma de salida del modelo que no coincide con el schema y, en `live-catalog`, por un tiempo de 56 604 ms que excede el SLO pese al timeout configurado del nodo. Detalle completo: [CAR-167-scorer-http-request.md](CAR-167-scorer-http-request.md).

## Estado

**Integración DEV implementada e inactiva; cierre bloqueado por el scorer real.**

[CAR-48](https://linear.app/carloshermesagent/issue/CAR-48/feat-implement-wf01-content-discovery) · Orca · [PR #14 (draft)](https://github.com/carlosr01/linkedin-content-engine/pull/14).
Rama: `feat/car-48-wf01-content-discovery`. Base del paquete local: `4df0220998113e04e2fdecc90620bcb05fea6702`.

- Entorno existente: `n8n-dev.innovaq-ai.com`, contenedor `linkedin-content-engine-n8n-dev-n8n-1`.
- n8n **2.35.7**; Node del runtime **24.18.1**.
- Workflow reutilizado: **MBjubZf00zHeukFo**, `WF01__content_discovery`.
- Versión final: **bcc18704-2881-4c3a-a29b-184e2a0a75f7**. Hash del export y versiones de cada tipo: [CAR-48-readback.json](CAR-48-readback.json).
- `active=false`, `activeVersionId=null`, sin pin data guardada. Único trigger: manual.
- Export releído y sanitizado: [wf01-content-discovery.json](../../workflows/discovery/wf01-content-discovery.json).
- No se creó otro entorno, workflow ni scheduler. Se retiró el Schedule Trigger del WF01 previamente existente e inactivo. El otro workflow de conectividad permaneció intacto.
- Sin acciones sobre PROD, Hermes, drafting, approval ni publicación. WF01 termina al persistir el candidato.

## Acceso y definiciones oficiales

MCP n8n sigue sin exponerse en esta sesión; la integración se realizó por el runtime/CLI del **DEV existente**, no mediante un MCP ficticio. Health DEV respondió 200; el endpoint MCP respondió 401. No se solicitaron ni imprimieron credenciales.

Se consultaron las skills oficiales de [n8n-io/skills](https://github.com/n8n-io/skills/tree/180b8415e3b73f78828cfa01e908e67f89f2a139): meta-skill, lifecycle, error-handling, code-nodes, node-configuration, data-tables, credential-security, agents y loops, incluyendo la referencia de pruebas. Se exportaron **910 definiciones del runtime instalado** mediante `n8n export:nodes`. El generador comprueba cada combinación type/typeVersion contra esa exportación live. La evidencia de tipos registra el hash del fichero consultado.

Se inspeccionaron los workflows y tablas existentes. Se reutilizaron la tabla `WF01 Content Candidates` y la credencial OpenRouter vinculada, sin exportar su contenido. Las tablas anteriores de fuentes y scores quedaron sin cambios; cada nuevo candidato conserva sus tres contratos en un solo registro.

## Diseño implementado

Fuentes explícitas tomadas de `config/sources.example.yaml`: sólo **OpenAI News RSS**, `https://openai.com/news/rss.xml`, habilitada para WF01. Se excluye `manual_url`. Techo: 5 fuentes, una descarga RSS por fuente, 25 entradas/fuente y 25 entradas/ejecución; inválidos también consumen presupuesto. No se sigue paginación ni URLs propuestas por el modelo. Redirecciones HTTP deshabilitadas.

Se usan nodos nativos Set, Split Out, Loop Over Items, HTTP Request, Wait, IF, XML, Crypto SHA-256, Basic LLM Chain, OpenRouter Chat Model, Structured Output Parser y Data Table. Los Code nodes se limitan a clasificación de errores, normalización RSS, validación AJV de schemas del repositorio, aplicación del umbral y diagnósticos. AJV se compila de antemano para evitar evaluación dinámica en el sandbox. El polyfill URL empaquetado evita depender de un global que n8n no expone; las pruebas reproducen también la restricción sobre `Object.defineProperty`.

HTTP: timeout 30 s, tres intentos máximos para 429, 5xx o errores de red, backoff 1/2 s y respeto de `Retry-After`. Si éste supera 30 s, se difiere la fuente sin retry prematuro. Fuentes y candidatos se procesan secuencialmente; un fallo de fuente no cancela las demás. Timeout global: 900 s. Se rechaza XML con DOCTYPE/ENTITY y payload superior a 2 millones de caracteres antes del parseo.

Normalización: HTTP(S) sin credenciales; fragmento y parámetros `utm_*`, `fbclid`, `gclid` eliminados; parámetros funcionales conservados. Texto NFC y whitespace normalizado; título hasta 2.000 caracteres, contenido hasta 100.000. SHA-256 sobre `JSON.stringify([title, extractedText])`. Identidades derivadas del hash de URL canónica. Fechas inválidas se rechazan; autor y fecha ausentes quedan en null en los contratos JSON.

El lookup busca **URL canónica O content hash**. Se validan SourceRecord y ContentCandidate antes de scoring. El prompt system procede de `prompts/content-scorer.md`; el contenido externo se serializa como `untrustedCandidate`, sin tools. El schema y la coincidencia exacta de candidateId se vuelven a validar tras scoring. Umbral fijo **75**: sólo `SCORED` o `SELECTED`; `recommended` no decide el estado. Sin reparación automática de salida inválida.

Modelo final: `deepseek/deepseek-v4-flash-0731`, el previamente configurado. Se conserva la credencial existente. Timeout 30 s y hasta dos reintentos del SDK; la política de retry del SDK no equivale a una prueba de todos los errores del proveedor. Provenance conserva modelo, correlation ID, hashes de prompt/política/contexto de marca y timestamp. No se suministró contexto de marca; el prompt lo declara y exige valoración conservadora.

## Persistencia

La tabla existente tenía 59 registros antes de estas pruebas. Se añadieron cuatro columnas string: `source_object`, `candidate_object`, `score_object`, `provenance_object`. Un único insert nativo escribe los escalares y los tres contratos completos con provenance. Los registros anteriores no se eliminaron ni reescribieron.

Dos índices únicos PostgreSQL, sobre canonicalUrl y contentHash para filas con provenance no nulo, protegen los nuevos inserts contra carreras. Los registros heredados participan en el lookup, pero no se migraron a estos índices. La creación de índices usa la conexión del runtime; Data Tables no proporciona una opción equivalente en su nodo. **El export JSON por sí solo no transporta esos índices ni crea las columnas.**

La confirmación de persistencia exige que el nodo devuelva candidateId y los objetos persistidos. Un insert rechazado no se contabiliza como éxito aunque el nodo nativo devuelva un envelope inesperado. Los casos de colisión fuerzan un lookup obsoleto mediante pin data de ejecución y comprueban el rechazo atómico; no se afirma haber probado todas las intercalaciones de dos procesos simultáneos.

Los fixtures quedan en DEV, identificados por namespace `car48-*`; no se borran datos para maquillar resultados. Sus scores fijados usan provenance `fixture-scorer-v1`, claramente distintos de una respuesta real. La primera prueba exploratoria de persistencia, ejecución 42, precede a esa etiqueta: es un fixture, **no evidencia del modelo real**.

## Evidencia y límites de las pruebas

- [CAR-48-dev-results.json](CAR-48-dev-results.json): matriz final con execution IDs, inserts, duplicados, fallos y tiempos reales de retry.
- [CAR-48-persistence.json](CAR-48-persistence.json): relectura independiente de bundles, validación contra los tres schemas y referencias cruzadas.
- [CAR-48-provider-results.json](CAR-48-provider-results.json): pruebas sin pinning del scorer y diagnóstico del bloqueo.
- [CAR-48-readback.json](CAR-48-readback.json): comparación exacta de nodos, conexiones, settings, estado y pin data después del guardado.

La matriz usa HTTP real contra un servidor fixture temporal dentro del contenedor existente, nodos reales y la tabla DEV real. Fija únicamente la salida del scorer para probar determinísticamente fuente válida, ambos duplicados, item inválido, 429, 5xx, timeout, fallo parcial, score inválido y Retry-After excesivo. En las dos colisiones adicionales también fija el lookup vacío. El timeout se reduce a 100 ms sólo en su ejecución fixture; el workflow guardado conserva 30 s. No hay pin data persistida.

El harness usa WorkflowRunner del runtime instalado en modo manual y clona en memoria el workflow guardado para las sustituciones declaradas. Registra sólo el contexto de Data Tables requerido por el CLI; no inicia módulos de limpieza ni otro scheduler. No equivale a una prueba del editor web ni del transporte MCP. El estado n8n `success` por sí solo no demuestra éxito de negocio: los asserts verifican inserts y salidas de error.

Pruebas reales originales: ejecución **58**, scorer sobre fuente sintética, y **59**, catálogo OpenAI limitado a un candidato: el proveedor agotó el timeout y no se persistió candidato. La descarga y normalización de la fuente pública sí funcionaron. Una prueba temporal con `openai/gpt-4.1-mini`, ejecución **60**, fue rechazada por restricciones de modelos y ZDR de la cuenta. Se restauró el modelo original; no se cambiaron guardrails ni privacidad. La ejecución final **84**, sobre la versión final guardada y el catálogo real limitado a un candidato, volvió a fallar por timeout del proveedor: normalización VALID, cero inserts y un fallo de candidato observable.

## Reproducción

Sin credenciales:

```bash
npm ci
npm run ci
npm run discovery:replay
```

Validación final: **37 tests locales PASS**, **12 casos DEV deterministas PASS** (ejecuciones 72–83), cuatro bundles releídos schema-valid, CI y replay PASS. La suite local incluye los 34 tests del paquete previo y tres pruebas nuevas del normalizador empaquetado. El replay sigue siendo offline; no acredita el proveedor real.

Sólo en el DEV identificado, un operador puede exportar el workflow y las definiciones con `n8n export:workflow` / `n8n export:nodes`. No usar exportación de credenciales. Con esos ficheros privados:

```bash
node scripts/n8n-dev/prepare-update.mjs PRIVATE_LIVE_EXPORT PRIVATE_NODE_TYPES PRIVATE_INTENDED
```

El script exige WF01 existente e inactivo, conserva su binding y comprueba los tipos live. Después de importar en ese DEV y releer:

```bash
node scripts/n8n-dev/export-verified.mjs PRIVATE_INTENDED PRIVATE_SAVED workflows/discovery/wf01-content-discovery.json docs/verification/CAR-48-readback.json
```

`runtime-harness.cjs` está ligado deliberadamente a la versión inspeccionada. Ejecutar dentro del contenedor existente, con un puerto de broker disponible exclusivo del proceso (se usó `N8N_RUNNERS_BROKER_PORT=5681`), workflow ID y ruta privada de evidencia. Modos: `prepare-store` (columnas/índices idempotentes) y `test`; filtros `matrix`, `live-scorer`, `live-catalog`. No instalar otro n8n ni arrancar otro servidor principal. Los ficheros `.private-debug` y `.bundles` son privados y **no se añaden a git**. `verify-persistence.mjs` genera evidencia sin cuerpos de contenido a partir de los bundles releídos.

El export versionado omite credenciales y metadatos de instancia, reemplaza IDs de tablas por `BIND_EXISTING_DEV_CANDIDATES_TABLE` y deriva IDs de nodos del nombre. Para importarlo hay que enlazar explícitamente la tabla DEV y la credencial existente; no es un workflow listo para activar.

## Riesgos y siguiente acción

1. **CI remoto bloqueado:** [run 35761137168](https://github.com/carlosr01/linkedin-content-engine/actions/runs/35761137168) terminó en failure sin iniciar pasos. GitHub indicó una restricción de facturación/límite de gasto de la cuenta. El CI local pasó; no se afirma validación remota. Resolver la cuenta y reejecutar CI.
2. **Bloqueo pendiente:** conseguir respuesta válida del modelo permitido dentro del timeout de 30 s y repetir `live-scorer` / `live-catalog`. Orca debe coordinar la revisión del proveedor; no se solicita reducir sus restricciones de privacidad. PR #14 permanece draft y no está listo para declarar CAR-48 completo.
3. La cota de payload se aplica después de descargar; el HTTP Request nativo mantiene el cuerpo en memoria. No se acredita un límite de bytes en streaming. Catálogo explícito, redirects deshabilitados y timeout acotan la exposición, pero no eliminan este límite.
4. La fuente/modelo públicos pueden cambiar. La separación de prompts no demuestra resistencia editorial completa a prompt injection; la autoridad técnica termina en un candidato schema-valid.
5. Los índices dependen del esquema físico de Data Tables de n8n 2.35.7; revisar tras upgrades. Datos heredados no migrados, sin prueba de recuperación ante caída del servidor.
6. El runtime advierte que PostgreSQL 16 tiene soporte de compatibilidad. El lockfile conserva una vulnerabilidad high preexistente en fast-uri; no se amplió el alcance a mantenimiento de plataforma.

No activar el workflow ni fusionar el PR como parte de esta entrega. Una revisión independiente de los cambios puede comenzar, pero el cierre requiere resolver el scorer y completar la prueba real.
