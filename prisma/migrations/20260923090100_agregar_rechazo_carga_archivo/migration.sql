-- Nuevo (rechazo de cargas aprobadas): tabla `carga_archivo_rechazo` (1:1 con `carga_archivo`),
-- renombrado de las columnas de `carga_archivo_publicada` que ahora sirven tanto para reemplazo
-- consentido como para rechazo unilateral, y el campo explícito que distingue cuál de los dos fue.

-- CreateEnum
CREATE TYPE "TipoDesactivacionCargaPublicada" AS ENUM ('REEMPLAZO', 'RECHAZO');

-- AlterTable: RENAME COLUMN, no drop+create, para no perder los datos de reemplazos ya escritos.
ALTER TABLE "carga_archivo_publicada" RENAME COLUMN "reemplazadaEn" TO "desactivadaEn";
ALTER TABLE "carga_archivo_publicada" RENAME COLUMN "motivoReemplazo" TO "motivoDesactivacion";

-- AlterTable: columna nueva, nullable mientras `activo = true`. Backfill determinista para las
-- filas ya desactivadas por un reemplazo (todo lo ya existente es reemplazo: el rechazo es una
-- funcionalidad nueva, no puede haber una fila desactivada por rechazo todavía).
ALTER TABLE "carga_archivo_publicada" ADD COLUMN "motivoDesactivacionTipo" "TipoDesactivacionCargaPublicada";

UPDATE "carga_archivo_publicada"
SET "motivoDesactivacionTipo" = 'REEMPLAZO'
WHERE "activo" = false AND "desactivadaEn" IS NOT NULL;

-- CreateTable
CREATE TABLE "carga_archivo_rechazo" (
    "id" TEXT NOT NULL,
    "cargaArchivoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "rechazadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rechazadoPorId" TEXT NOT NULL,
    "reaperturaConsumidaEn" TIMESTAMP(3),
    "reaperturaConsumidaPorCargaArchivoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carga_archivo_rechazo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carga_archivo_rechazo_cargaArchivoId_key" ON "carga_archivo_rechazo"("cargaArchivoId");

-- CreateIndex
CREATE UNIQUE INDEX "carga_archivo_rechazo_reaperturaConsumidaPorCargaArchivoId_key" ON "carga_archivo_rechazo"("reaperturaConsumidaPorCargaArchivoId");

-- AddForeignKey
ALTER TABLE "carga_archivo_rechazo" ADD CONSTRAINT "carga_archivo_rechazo_cargaArchivoId_fkey" FOREIGN KEY ("cargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo_rechazo" ADD CONSTRAINT "carga_archivo_rechazo_rechazadoPorId_fkey" FOREIGN KEY ("rechazadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo_rechazo" ADD CONSTRAINT "carga_archivo_rechazo_reaperturaConsumidaPorCargaArchivoId_fkey" FOREIGN KEY ("reaperturaConsumidaPorCargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
