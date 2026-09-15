-- Perfil nuevo (RF-14): revisor de repositorio, con área propia `/revisor`. Mismo mecanismo de
-- fila semilla que la migración de perfiles de RF-09, idempotente vía `ON CONFLICT DO NOTHING`.
INSERT INTO "perfil" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
    ('REVISOR_REPOSITORIO', 'Revisor de repositorio', NULL, 3, true)
ON CONFLICT ("codigo") DO NOTHING;

-- CreateEnum
CREATE TYPE "EstadoCargaArchivo" AS ENUM ('CON_ERRORES', 'PENDIENTE_VISTO_BUENO', 'APROBADA');

-- CreateEnum
CREATE TYPE "TipoErrorCargaArchivo" AS ENUM ('COLUMNA_FALTANTE', 'COLUMNA_INESPERADA', 'VALOR_REQUERIDO_VACIO', 'TIPO_DATO_INVALIDO', 'REGLA_VALIDACION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoDatoColumna" ADD VALUE 'RUT';
ALTER TYPE "TipoDatoColumna" ADD VALUE 'EMAIL';

-- CreateTable
CREATE TABLE "carga_archivo" (
    "id" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombreArchivoOriginal" TEXT NOT NULL,
    "tipoContenidoArchivo" TEXT NOT NULL,
    "contenidoArchivo" BYTEA NOT NULL,
    "cantidadFilasDatos" INTEGER NOT NULL,
    "cantidadErrores" INTEGER NOT NULL,
    "estado" "EstadoCargaArchivo" NOT NULL,
    "vistoBuenoEn" TIMESTAMP(3),
    "vistoBuenoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carga_archivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_carga_archivo" (
    "id" TEXT NOT NULL,
    "cargaArchivoId" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "columna" TEXT,
    "tipoError" "TipoErrorCargaArchivo" NOT NULL,
    "mensaje" TEXT NOT NULL,

    CONSTRAINT "error_carga_archivo_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "carga_archivo" ADD CONSTRAINT "carga_archivo_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo" ADD CONSTRAINT "carga_archivo_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo" ADD CONSTRAINT "carga_archivo_vistoBuenoPorId_fkey" FOREIGN KEY ("vistoBuenoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_carga_archivo" ADD CONSTRAINT "error_carga_archivo_cargaArchivoId_fkey" FOREIGN KEY ("cargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
