-- CreateEnum
CREATE TYPE "EstadoSolicitudReemplazoCarga" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "carga_archivo_publicada" (
    "id" TEXT NOT NULL,
    "cargaArchivoId" TEXT NOT NULL,
    "publicadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicadoPorId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "reemplazadaEn" TIMESTAMP(3),
    "reemplazadaPorCargaArchivoId" TEXT,
    "motivoReemplazo" TEXT,

    CONSTRAINT "carga_archivo_publicada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga_archivo_publicada_fila" (
    "id" TEXT NOT NULL,
    "cargaArchivoPublicadaId" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "valores" JSONB NOT NULL,

    CONSTRAINT "carga_archivo_publicada_fila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_reemplazo_carga" (
    "id" TEXT NOT NULL,
    "cargaArchivoId" TEXT NOT NULL,
    "solicitadoPorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoSolicitudReemplazoCarga" NOT NULL DEFAULT 'PENDIENTE',
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "comentarioRevision" TEXT,
    "nuevaCargaArchivoId" TEXT,
    "utilizadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_reemplazo_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carga_archivo_publicada_cargaArchivoId_key" ON "carga_archivo_publicada"("cargaArchivoId");

-- CreateIndex
CREATE UNIQUE INDEX "carga_archivo_publicada_fila_cargaArchivoPublicadaId_numero_key" ON "carga_archivo_publicada_fila"("cargaArchivoPublicadaId", "numeroFila");

-- AddForeignKey
ALTER TABLE "carga_archivo_publicada" ADD CONSTRAINT "carga_archivo_publicada_cargaArchivoId_fkey" FOREIGN KEY ("cargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo_publicada" ADD CONSTRAINT "carga_archivo_publicada_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo_publicada" ADD CONSTRAINT "carga_archivo_publicada_reemplazadaPorCargaArchivoId_fkey" FOREIGN KEY ("reemplazadaPorCargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_archivo_publicada_fila" ADD CONSTRAINT "carga_archivo_publicada_fila_cargaArchivoPublicadaId_fkey" FOREIGN KEY ("cargaArchivoPublicadaId") REFERENCES "carga_archivo_publicada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_cargaArchivoId_fkey" FOREIGN KEY ("cargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_nuevaCargaArchivoId_fkey" FOREIGN KEY ("nuevaCargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (agregado a mano: Prisma no expresa un índice único parcial con WHERE en su DSL,
-- mismo mecanismo ya usado para `ventana_carga`). Evita dos solicitudes PENDIENTE simultáneas
-- para la misma carga; no impide crear una nueva tras un RECHAZADA, ni tras una APROBADA que
-- expiró sin usarse.
CREATE UNIQUE INDEX "solicitud_reemplazo_carga_carga_pendiente_key"
  ON "solicitud_reemplazo_carga" ("cargaArchivoId")
  WHERE "estado" = 'PENDIENTE';
