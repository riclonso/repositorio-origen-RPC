-- Corrección: reemplaza `VentanaCarga.tipoArchivo` (enum EXCEL/CSV) por una referencia directa a
-- un `FormatoExcel` concreto (`formatoExcelId`). Relación 1:1 desde `VentanaCarga` hacia
-- `FormatoExcel` (varias ventanas de años distintos pueden apuntar al mismo formato).
--
-- Se agrega la columna nullable primero, se hace el backfill dirigido de la única fila real
-- existente (confirmado contra la base de desarrollo antes de escribir esta migración: una sola
-- fila en `ventana_carga` con `eliminadaEn IS NULL`, año 2026, `tipoArchivo = 'EXCEL'`), luego se
-- fuerza `NOT NULL`. El índice único parcial sobre `anio` (agregado a mano en
-- `20260914191128_eliminar_ventana_carga_rf15`, mismo mecanismo ya usado en RF-09/14/15) se
-- reemplaza por uno sobre `(anio, "formatoExcelId")`, mismo `WHERE "eliminadaEn" IS NULL`.

-- AlterTable: se agrega nullable para poder hacer el backfill antes de exigir NOT NULL.
ALTER TABLE "ventana_carga" ADD COLUMN     "formatoExcelId" TEXT;

-- AddForeignKey
ALTER TABLE "ventana_carga" ADD CONSTRAINT "ventana_carga_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill dirigido: la única ventana real existente hoy (año 2026, tipoArchivo=EXCEL) queda
-- apuntando al formato "VARIABLES ENVIO DE HEMATOLOGIA" (id 8392e218-f2b9-4ab5-b224-386b0b2164df),
-- el único formato con cargas reales asociadas a esa ventana.
UPDATE "ventana_carga" SET "formatoExcelId" = '8392e218-f2b9-4ab5-b224-386b0b2164df' WHERE "formatoExcelId" IS NULL;

-- AlterTable: ahora que todas las filas tienen un valor, se exige NOT NULL.
ALTER TABLE "ventana_carga" ALTER COLUMN "formatoExcelId" SET NOT NULL;

-- DropIndex (mano, no generado por Prisma): la unicidad pasa de "un año" a "un año y un formato".
DROP INDEX "ventana_carga_anio_no_eliminada_key";

-- CreateIndex (mano, no generado por Prisma: la unicidad de `(anio, formatoExcelId)` debe regir
-- solo mientras la ventana no esté eliminada, y Prisma no expresa un índice único parcial
-- (`WHERE`) en su schema DSL. Sin esto, una ventana eliminada dejaría el par año/formato
-- bloqueado para siempre.)
CREATE UNIQUE INDEX "ventana_carga_anio_formato_no_eliminada_key" ON "ventana_carga"("anio", "formatoExcelId") WHERE "eliminadaEn" IS NULL;

-- AlterTable: se elimina la columna vieja, ya reemplazada por la referencia al formato.
ALTER TABLE "ventana_carga" DROP COLUMN "tipoArchivo";
