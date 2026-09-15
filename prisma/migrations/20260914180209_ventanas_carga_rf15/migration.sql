-- RF-15: ventanas de carga (año calendario durante el cual un notificador puede subir un
-- archivo). El valor de enum nuevo no se usa en ningún dato de esta misma migración, así que no
-- hace falta separarlo en una migración propia (ver nota en CLAUDE.md sobre `ALTER TYPE ... ADD
-- VALUE` y transacciones).
-- AlterEnum
ALTER TYPE "TipoReglaValidacionFormatoExcel" ADD VALUE 'FECHA_DENTRO_DE_VENTANA_VIGENTE';

-- CreateTable
CREATE TABLE "ventana_carga" (
    "id" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "fechaApertura" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ventana_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ventana_carga_anio_key" ON "ventana_carga"("anio");

-- AddForeignKey
ALTER TABLE "ventana_carga" ADD CONSTRAINT "ventana_carga_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: columna nueva NULLABLE primero, porque `carga_archivo` ya tiene filas (entorno de
-- desarrollo local, desechable). Se backfillea con una ventana "de respaldo" por año y luego se
-- fija NOT NULL.
ALTER TABLE "carga_archivo" ADD COLUMN "ventanaCargaId" TEXT;

-- Backfill: una ventana de respaldo por cada año calendario ya presente en `carga_archivo`,
-- creada a nombre del primer usuario ADMIN encontrado (dato de desarrollo, no de producción).
INSERT INTO "ventana_carga" ("id", "anio", "fechaApertura", "fechaVencimiento", "creadoPorId", "updatedAt")
SELECT
  gen_random_uuid(),
  anios.anio,
  make_timestamp(anios.anio, 1, 1, 0, 0, 0),
  make_timestamp(anios.anio, 12, 31, 23, 59, 59.999),
  (SELECT "id" FROM "usuario" WHERE "perfilCodigo" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1),
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT EXTRACT(YEAR FROM "createdAt")::int AS anio FROM "carga_archivo") AS anios
ON CONFLICT ("anio") DO NOTHING;

UPDATE "carga_archivo" ca
SET "ventanaCargaId" = vc."id"
FROM "ventana_carga" vc
WHERE vc."anio" = EXTRACT(YEAR FROM ca."createdAt")::int;

-- AlterTable: ahora sí, NOT NULL.
ALTER TABLE "carga_archivo" ALTER COLUMN "ventanaCargaId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "carga_archivo" ADD CONSTRAINT "carga_archivo_ventanaCargaId_fkey" FOREIGN KEY ("ventanaCargaId") REFERENCES "ventana_carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
