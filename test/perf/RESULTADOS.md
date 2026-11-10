# Resultados de rendimiento — 2026-10-24 y 2026-10-25

API compilada en modo producción (puerto 3100) con su worker, base `perf` en el Postgres 16 de Docker y S3Mock como bucket. Datos del seed: 40 terapeutas, 60 pacientes, 20 tabletas, 360 sesiones y 10 800 eventos. Las corridas suman eventos: la base tenía unos 377 000 al terminar las primeras y unos 570 000 al terminar las segundas.

**Advertencia de entorno:** la máquina (12 núcleos) corría a la vez dos emuladores, Metro, la API de desarrollo y el agente de diseño (carga promedio de 7 a 16). Las cifras son pesimistas y varían ±40 % entre corridas: sirven para comparar y encontrar cuellos de botella, no como capacidad absoluta del VPS. Por eso la comparación que vale para las correcciones es el [A/B controlado](#ab-controlado): la misma base restaurada y las dos versiones una detrás de la otra.

## Antes de las correcciones (2026-10-24)

- **smoke** (1 usuario por escenario, 30 s): 0 % de errores; todos los umbrales cumplidos.
- **load** (30 terapeutas, 20 tabletas, 1 admin, 2 PDF; 4,5 min): 4 958 peticiones, 39 720 eventos, 0 errores 5xx. p95: panel 396 ms, admin 304 ms, tabletas 1,05 s, inicio de sesión 1,4 s, PDF listo 2,6 s. 2 lotes con «connection reset by peer» (ver hallazgo 3). Una segunda corrida dio p95 de panel 561 ms y de tabletas 1,43 s.
- **stress** (40 terapeutas con poca pausa, 20 tabletas a 30 lotes por minuto, 2 admin, 4 PDF; 5,5 min): 14 182 peticiones, 127 480 eventos (381 por segundo), 0 % de errores. p95: panel 478 ms, admin 357 ms, tabletas 973 ms, inicio de sesión 1,01 s, PDF listo 2,66 s. CPU promedio: API 101 %, Postgres 264 % (máximo 550 %).
- **burst** (20 tabletas sincronizan en el mismo segundo, 6 veces): 0 errores; mediana 1,13 s, p95 2,65 s y máximo 3,64 s. Hasta `GET /devices/settings` (trivial) tardó 909 ms de mediana: las peticiones hacen cola.

Endpoints más lentos en stress (p95): `POST /sync/batch` 1,1 s; `GET /patients/:id/reports` 607 ms; `GET /sync/profiles` 603 ms; `GET /patients/:id` 552 ms.

## Hallazgos

1. **Error 500 por falta de conexiones** (1 vez en 5 095 peticiones, al arrancar la carga): `GET /sync/profiles` falló con `Transaction API error: Unable to start a transaction in the given time`. El pool de `pg` es de 10 conexiones (valor por defecto de `PrismaPg`) y una transacción espera como máximo 2 s una conexión libre; los listados paginados usan `$transaction([findMany, count])`, que ocupa una conexión durante toda la transacción. **Corregido** (corrección 1).
2. **El recálculo de «Más usados» recorre toda la tabla `Event` en cada lote** (`refreshUsage`, spec 105 FR-008): con 377 000 eventos tarda 72 ms (recorrido secuencial) y crece con el historial de todo el Centro. Leyendo primero las sesiones del paciente (CTE materializado), la misma consulta usa el índice `(sessionId, occurredAt)` y tarda 7,4 ms. **Corregido** (corrección 2). Sigue igual que cada lote suba la versión del perfil del paciente, así que todas las tabletas lo vuelven a bajar.
3. **«connection reset by peer» en 2 lotes** (código k6 1220), sin error en la API, en el mismo momento de una recolección grande del montón. Causa probable: carrera del keep-alive de Node (5 s por defecto) con la pausa de la recolección; la tableta reintenta sola (el lote queda pendiente), así que no se pierden datos. **Corregido** (corrección 3): no volvió a aparecer en ninguna corrida.
4. **`GET /sync/profiles` gasta CPU del hilo principal en firmar URLs**: una página de 20 perfiles son 570 KB y 820 URLs firmadas (unos 255 ms con la API en reposo); 100 perfiles, 2 460 firmas y 702 ms. Con varias tabletas a la vez frena a todas las demás peticiones. **Corregido** (corrección 4).
5. **Memoria: sin fuga.** El RSS llegó a ~1 GB, pero tras una recolección forzada lo retenido quedó en 211–212 MB después de cada una de tres corridas (60 MB al arrancar): V8 deja crecer el montón si hay RAM libre. En un VPS conviene fijar `--max-old-space-size`.
6. **Aviso de `pg`** (`Calling client.query() when the client is already executing a query`): sale del intérprete de Prisma 7.10.1 dentro de las transacciones, no del código de la API. Funciona con pg 8; romperá con pg 9.
7. **Funciona como se diseñó:** el límite de 60 lotes por minuto por tableta frena (429) a una tableta que lo supera; la cola de PDF mantiene la API respondiendo (PDF listo en ~2–3 s con 4 pedidos a la vez); argon2id hace lento el inicio de sesión a propósito.
8. **Los lotes de las tabletas se atienden de uno en uno** (2026-10-25, sin corregir). `refreshUsage` sube la versión global de sincronización (`GlobalSyncVersion`, una sola fila) dentro de su transacción, así que cada lote espera a que el anterior confirme. Durante el burst, 52 de unas 66 muestras de `pg_stat_activity` esperaban `Lock: transactionid/tuple` sobre esa fila. Por eso, con las correcciones, la mediana de `POST /sync/batch` en el burst no bajó (596 → 593 ms) aunque el resto de endpoints sí. Propuesta: hacer el recálculo y la subida de versión en una sola sentencia (CTE que modifica datos) para que el bloqueo dure lo que tarda Postgres y no los viajes de ida y vuelta desde Node. Una secuencia no sirve: sus valores no siguen el orden de confirmación y una tableta que pide `since=` podría saltarse cambios.

## Correcciones aplicadas (2026-10-25)

1. **Conexiones:** pool de 20 (`DATABASE_POOL_MAX`) y hasta 5 s de espera por conexión para las transacciones (`src/prisma/prisma.service.ts`). Los 14 listados paginados leen página y total con `Promise.all` en vez de `$transaction([...])` y ya no retienen una conexión; las escrituras siguen en transacción.
2. **«Más usados»:** `refreshUsage` lee primero las sesiones del paciente con un CTE materializado y la consulta usa el índice (`src/sync/infrastructure/prisma/sync.prisma.repository.ts`).
3. **Keep-alive:** `keepAliveTimeout` de 65 s y `headersTimeout` de 66 s (`src/main.ts`), por encima de los 60 s habituales de un proxy o balanceador.
4. **URLs firmadas:** `S3FileStorage` reutiliza cada URL mientras le quede al menos la mitad de su vigencia (hasta 20 000 en memoria; se descartan al borrar el archivo).

Medidas sueltas con la API en reposo: `GET /sync/profiles` pasó de 252 a 55 ms (20 perfiles) y de 702 a 98 ms (100 perfiles); `refreshUsage`, de 72 a 7,4 ms. Pruebas e2e: 104/104.

## Después de las correcciones, corridas sueltas (2026-10-24, noche)

- **burst-v2:** 0 errores. p95 de tabletas 2,66 s → 950 ms (el umbral de 800 ms sigue sin cumplirse). Medianas: `GET /devices/settings` 909 → 66 ms y `GET /sync/profiles` 1,74 s → 91 ms; `POST /sync/batch` igual (596 → 593 ms, hallazgo 8), con su p95 de 2,98 a 1,47 s.
- **load-v2:** todos los umbrales cumplidos, 0 errores y ningún «connection reset». p95: panel 396 → 113 ms, admin 304 → 49 ms, tabletas 1,05 s → 294 ms, inicio de sesión 1,41 s → 285 ms, PDF listo 2,57 → 2,04 s. Ojo: la máquina estaba menos cargada (carga promedio 6,7 contra 9,6), así que parte de la mejora es del entorno.
- **stress-v2:** medianas mucho mejores (`GET /patients` 103 → 22 ms, `GET /patients/:id` 156 → 35 ms, `POST /sync/batch` 415 → 109 ms, `GET /sync/profiles` 275 → 42 ms) y la CPU promedio de la API bajó a la mitad (94 → 47 %). Pero el p95 empeoró: panel 478 → 801 ms y tabletas 973 ms → 1,19 s. No se puede atribuir a las correcciones: la máquina estaba saturada (carga promedio 15,9, máximo 23,8 en 12 núcleos), Postgres usó más CPU (245 → 284 %, máximo 697 %) y la base había crecido de 377 000 a unos 570 000 eventos.

## A/B controlado

2026-10-25, madrugada. La base `perf` se guardó con `pg_dump` después de stress-v2 (unos 570 000 eventos) y se restauró antes de cada versión. La versión anterior (sin las cuatro correcciones) y la corregida corrieron una detrás de la otra, cada una con burst y load. La máquina estaba tranquila y con una carga parecida en las dos: carga promedio 2,3 y 3,5 en burst, 4,9 y 3,8 en load. Ninguna de las dos dejó errores en el log de la API ni del worker.

- **burst:** el p95 de las tabletas bajó de 1,86 s a 611 ms, y ahora sí cumple el umbral de 800 ms. La versión anterior dejó 1 lote sin respuesta (error TCP de k6, código 1200); la corregida, ninguno. Medianas:
  - `GET /devices/settings`: de 554 a 44 ms.
  - `GET /sync/profiles`: de 1,12 s a 63 ms.
  - `POST /sync/batch`: de 857 a 435 ms (p95 de 2,25 a 1,21 s). Lo que queda de espera es el hallazgo 8.
- **load:** las dos cumplen los umbrales y ninguna tuvo errores, pero la corregida con mucho margen. p95:
  - Panel: de 225 a 119 ms.
  - Tabletas: de 547 a 179 ms.
  - Admin: de 104 a 14 ms.
  - Inicio de sesión: de 234 a 165 ms.
  - PDF listo: de 2,25 a 2,08 s.
  - Por endpoint: `POST /sync/batch` pasó de 318 a 74 ms de mediana y `GET /sync/profiles` de 219 a 24 ms; `GET /patients/:id/reports` bajó su p95 de 376 a 159 ms.
- **Recursos en load:**
  - CPU promedio de la API: de 36 a 20 %.
  - CPU de Postgres: de 196 a 103 % (máximo de 615 a 289 %).
  - RSS de la API: de 688 a 421 MB (máximo de 1 GB a 477 MB).
- **Variación entre corridas:** otra corrida de la versión corregida, hecha 3,5 h antes con la máquina más cargada (carga 6,4), dio p95 de tabletas de 261 ms en load y de 1,27 s en burst. Es la variación de entorno que obliga a comparar así.

**Conclusión:** las cuatro correcciones mejoran todo lo medido, y en burst el p95 de las tabletas bajó a un tercio. Lo que falta en `POST /sync/batch` es el bloqueo de `GlobalSyncVersion` (hallazgo 8). El A/B no incluyó stress: el p95 peor de stress-v2 coincidió con la máquina saturada y no se ha comprobado en condiciones controladas.

Archivos: `results/ab-old-*`, `results/ab-new-*` y `results/ab-new-previa-*` (JSON del resumen, CSV por petición y CSV de recursos).
