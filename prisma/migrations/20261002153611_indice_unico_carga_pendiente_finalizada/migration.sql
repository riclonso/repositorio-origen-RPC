-- CreateIndex (agregado a mano: Prisma no expresa un índice único parcial con WHERE en su DSL,
-- mismo mecanismo ya usado en `solicitud_reemplazo_carga_carga_pendiente_key`). A lo más UNA carga
-- `PENDIENTE_VISTO_BUENO` ya finalizada (enviada a decisión) por combinación (usuario, ventana). Es
-- la defensa final de `PrismaCargaArchivoRepository.finalizar()` ante dos finalizaciones
-- concurrentes de cargas distintas de la misma combinación: la segunda falla con P2002 y se
-- traduce a `CARGA_PENDIENTE_DECISION`. Antes de crearla se verificó que los datos existentes no
-- la violan.
CREATE UNIQUE INDEX "carga_archivo_pendiente_finalizada_key"
  ON "carga_archivo" ("usuarioId", "ventanaCargaId")
  WHERE "estado" = 'PENDIENTE_VISTO_BUENO' AND "finalizadaEn" IS NOT NULL;
