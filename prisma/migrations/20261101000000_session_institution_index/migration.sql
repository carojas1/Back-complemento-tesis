-- Los paneles de inicio cuentan las sesiones de un centro por fecha (últimos 30 días, sesiones por semana, carga de cada
-- terapeuta). Con solo el índice por paciente, PostgreSQL recorría toda la tabla: con 500 000 sesiones, de 63-97 ms a 2-3 ms.
-- CreateIndex
CREATE INDEX "Session_institutionId_startedAt_idx" ON "Session"("institutionId", "startedAt");
