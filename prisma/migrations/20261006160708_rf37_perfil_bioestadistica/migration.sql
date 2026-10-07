-- RF-37: perfil Bioestadística. Reporta archivos de Defunciones y Egresos por año, en formato libre
-- (.xlsx o .csv), hasta 200 MB. El binario vive en disco ("rutaArchivo"); las filas se guardan en
-- JSONB en una tabla propia; los reemplazos pasan por una solicitud aprobada por ADMIN o
-- REVISOR_REPOSITORIO, igual que el notificador.
--
-- Generado por Prisma y completado a mano (al final): fila semilla del perfil, índices únicos
-- parciales y CHECKs de coherencia, que el DSL de Prisma no expresa. Todo corre en la transacción
-- de la migración.
--
-- Reversión manual (si hiciera falta, y solo si no hay datos que conservar):
--   DROP TABLE "solicitud_reemplazo_bioestadistica";
--   DROP TABLE "carga_bioestadistica_fila";
--   DROP TABLE "carga_bioestadistica";
--   DROP TYPE "EstadoCargaBioestadistica";
--   DROP TYPE "TipoArchivoBioestadistica";
--   DELETE FROM "perfil" WHERE "codigo" = 'BIOESTADISTICA';  -- falla (RESTRICT) si tiene usuarios

-- CreateEnum
CREATE TYPE "TipoArchivoBioestadistica" AS ENUM ('DEFUNCIONES', 'EGRESOS');

-- CreateEnum
CREATE TYPE "EstadoCargaBioestadistica" AS ENUM ('PROCESANDO', 'ACTIVA', 'REEMPLAZADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "carga_bioestadistica" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "tipoArchivo" "TipoArchivoBioestadistica" NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "establecimientoId" TEXT NOT NULL,
    "nombreArchivoOriginal" VARCHAR(255) NOT NULL,
    "tipoContenidoArchivo" TEXT NOT NULL,
    "rutaArchivo" TEXT,
    "tamanoBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "encabezados" TEXT[],
    "cantidadFilasDatos" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoCargaBioestadistica" NOT NULL DEFAULT 'PROCESANDO',
    "motivoFallo" VARCHAR(40),
    "procesadaEn" TIMESTAMP(3),
    "desactivadaEn" TIMESTAMP(3),
    "reemplazadaPorCargaId" TEXT,
    "motivoDesactivacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carga_bioestadistica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga_bioestadistica_fila" (
    "id" TEXT NOT NULL,
    "cargaBioestadisticaId" TEXT NOT NULL,
    "numeroFila" INTEGER NOT NULL,
    "valores" JSONB NOT NULL,

    CONSTRAINT "carga_bioestadistica_fila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_reemplazo_bioestadistica" (
    "id" TEXT NOT NULL,
    "cargaBioestadisticaId" TEXT NOT NULL,
    "solicitadoPorId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "EstadoSolicitudReemplazoCarga" NOT NULL DEFAULT 'PENDIENTE',
    "revisadoPorId" TEXT,
    "revisadoEn" TIMESTAMP(3),
    "comentarioRevision" TEXT,
    "diasVigencia" INTEGER,
    "nuevaCargaBioestadisticaId" TEXT,
    "utilizadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_reemplazo_bioestadistica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carga_bioestadistica_reemplazadaPorCargaId_key" ON "carga_bioestadistica"("reemplazadaPorCargaId");

-- CreateIndex
CREATE INDEX "carga_bioestadistica_usuarioId_idx" ON "carga_bioestadistica"("usuarioId");

-- CreateIndex
CREATE INDEX "carga_bioestadistica_anio_tipoArchivo_estado_idx" ON "carga_bioestadistica"("anio", "tipoArchivo", "estado");

-- CreateIndex
CREATE INDEX "carga_bioestadistica_establecimientoId_idx" ON "carga_bioestadistica"("establecimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "carga_bioestadistica_fila_cargaBioestadisticaId_numeroFila_key" ON "carga_bioestadistica_fila"("cargaBioestadisticaId", "numeroFila");

-- CreateIndex
CREATE INDEX "solicitud_reemplazo_bioestadistica_solicitadoPorId_idx" ON "solicitud_reemplazo_bioestadistica"("solicitadoPorId");

-- CreateIndex
CREATE INDEX "solicitud_reemplazo_bioestadistica_revisadoPorId_idx" ON "solicitud_reemplazo_bioestadistica"("revisadoPorId");

-- CreateIndex
CREATE INDEX "solicitud_reemplazo_bioestadistica_cargaBioestadisticaId_idx" ON "solicitud_reemplazo_bioestadistica"("cargaBioestadisticaId");

-- AddForeignKey
ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_reemplazadaPorCargaId_fkey" FOREIGN KEY ("reemplazadaPorCargaId") REFERENCES "carga_bioestadistica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_bioestadistica_fila" ADD CONSTRAINT "carga_bioestadistica_fila_cargaBioestadisticaId_fkey" FOREIGN KEY ("cargaBioestadisticaId") REFERENCES "carga_bioestadistica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_cargaBioestadisticaId_fkey" FOREIGN KEY ("cargaBioestadisticaId") REFERENCES "carga_bioestadistica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_nuevaCargaBioestadistic_fkey" FOREIGN KEY ("nuevaCargaBioestadisticaId") REFERENCES "carga_bioestadistica"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Agregado a mano
-- ---------------------------------------------------------------------------------------------

-- Perfil nuevo. Va en la migración (no en el seed) por el mismo motivo que los perfiles
-- anteriores: "prisma migrate deploy" corre siempre en el despliegue. Idempotente.
INSERT INTO "perfil" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
    ('BIOESTADISTICA', 'Bioestadística', NULL, 4, true)
ON CONFLICT ("codigo") DO NOTHING;

-- A lo más UNA carga ACTIVA por (usuario, año, tipo): la activación de un reemplazo desactiva la
-- anterior en la misma transacción; un P2002 aquí se traduce a FALLIDA con YA_REPORTADO.
CREATE UNIQUE INDEX "carga_bioestadistica_activa_key"
  ON "carga_bioestadistica" ("usuarioId", "anio", "tipoArchivo")
  WHERE "estado" = 'ACTIVA';

-- A lo más UN procesamiento en curso por (usuario, año, tipo): un P2002 aquí responde 409
-- EN_PROCESO y el archivo recibido se elimina.
CREATE UNIQUE INDEX "carga_bioestadistica_procesando_key"
  ON "carga_bioestadistica" ("usuarioId", "anio", "tipoArchivo")
  WHERE "estado" = 'PROCESANDO';

-- "desactivadaEn" existe si y solo si la carga fue reemplazada.
ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_desactivada_coherente"
  CHECK (("estado" = 'REEMPLAZADA') = ("desactivadaEn" IS NOT NULL));

-- "motivoFallo" existe si y solo si la carga falló.
ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_fallo_coherente"
  CHECK (("estado" = 'FALLIDA') = ("motivoFallo" IS NOT NULL));

ALTER TABLE "carga_bioestadistica" ADD CONSTRAINT "carga_bioestadistica_tamano_positivo"
  CHECK ("tamanoBytes" > 0);

-- Evita dos solicitudes PENDIENTE simultáneas para la misma carga (mismo criterio que
-- "solicitud_reemplazo_carga_carga_pendiente_key").
CREATE UNIQUE INDEX "solicitud_reemplazo_bioestadistica_carga_pendiente_key"
  ON "solicitud_reemplazo_bioestadistica" ("cargaBioestadisticaId")
  WHERE "estado" = 'PENDIENTE';

-- Mismos CHECK que "solicitud_reemplazo_carga" (RF-36): días obligatorios al aprobar, rango 1..90.
ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_dias_vigencia_aprobada"
  CHECK ("estado" <> 'APROBADA' OR "diasVigencia" IS NOT NULL);

ALTER TABLE "solicitud_reemplazo_bioestadistica" ADD CONSTRAINT "solicitud_reemplazo_bioestadistica_dias_vigencia_rango"
  CHECK ("diasVigencia" IS NULL OR "diasVigencia" BETWEEN 1 AND 90);
