# Pruebas de rendimiento (k6)

Simulan un día del Centro con todo a la vez: terapeutas en el panel, tabletas sincronizando lotes firmados, el administrador y PDF pedidos por la cola. Corren contra una **API aislada** con su propia base y un bucket local; **nunca contra Neon** (las pruebas escriben sesiones, auditoría y archivos).

## Entorno aislado

```bash
# Base: una base "perf" en el contenedor de pruebas; bucket: S3Mock en el puerto 9100.
docker start necon-test-db
docker exec necon-test-db psql -U postgres -c "create database perf"
DATABASE_URL=postgresql://postgres:test@localhost:55432/perf pnpm exec prisma migrate deploy
DATABASE_URL=postgresql://postgres:test@localhost:55432/perf ADMIN_NAME="Admin Perf" \
  ADMIN_EMAIL=admin@perf.test ADMIN_PASSWORD=PerfAdmin2026 pnpm db:seed
docker run -d --name necon-perf-s3 -p 127.0.0.1:9100:9090 \
  -e COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=uploads adobe/s3mock

# API y worker compilados, en modo producción, en el puerto 3100, con un .env propio (valores de prueba, no los reales):
# PORT=3100, NODE_ENV=production, TRUST_PROXY_HOPS=1, DATABASE_URL=…/perf, AWS_ENDPOINT_URL_S3=http://127.0.0.1:9100,
# S3_BUCKET=uploads, APP_KEY=perf-app-key, JWT_SECRET, CONSENT_ENCRYPTION_KEY y SMTP_HOST de prueba.
node dist/main    # y en otra terminal: node dist/worker
```

Conviene copiar `dist/` a otra carpeta antes de medir: `pnpm start:dev` la recompila con cada cambio.

## Datos y ejecución

```bash
node test/perf/seed.mjs                              # ~6 min: 40 terapeutas, 60 pacientes, 20 tabletas, 360 sesiones
k6 run -e PROFILE=smoke  test/perf/necon.js     # 30 s, 1 usuario por escenario: que todo responda
k6 run -e PROFILE=load   test/perf/necon.js     # 4,5 min: 30 terapeutas, 20 tabletas, 2 PDF a la vez
k6 run -e PROFILE=stress test/perf/necon.js     # 5,5 min: 40 terapeutas con poca pausa, 4 PDF a la vez
k6 run -e PROFILE=burst  test/perf/necon.js     # 1 min: las 20 tabletas sincronizan en el mismo segundo
```

`fixtures.json` (cuentas y llaves de prueba) lo crea el seed y git lo ignora. Para guardar el resultado: `--summary-export test/perf/results/<perfil>.json` y, por petición, `--out csv=test/perf/results/<perfil>-requests.csv`. Los resultados, lo encontrado y las correcciones están en [RESULTADOS.md](RESULTADOS.md).

Para comparar dos versiones de la API no basta con correrlas en momentos distintos: cada corrida suma eventos a la base y la carga de la máquina cambia. Se guarda la base con `pg_dump -Fc`, se restaura antes de cada versión y se corren una detrás de la otra con el mismo perfil.

Las tabletas se reparten por iteración del escenario y no por VU: k6 numera los VU intercalando escenarios, y dos VU con la misma tableta duplicarían su ritmo y chocarían con su límite.

## Umbrales

- Errores HTTP < 1 % y checks > 99 %.
- p95 del panel < 500 ms; tabletas y administrador < 800 ms; inicio de sesión < 1,5 s (argon2id es lento a propósito).
- p95 de un PDF listo (de pedirlo a tener la URL) < 20 s.

Los límites de la API (200 peticiones por minuto por usuario, 60 por tableta, 5 códigos de registro por minuto) son parte de lo que se mide: cada VU es una terapeuta o una tableta distinta, y `throttled_429` cuenta los rechazos.
