-- DropIndex
DROP INDEX "ventana_carga_anio_key";

-- AlterTable
ALTER TABLE "ventana_carga" ADD COLUMN     "eliminadaEn" TIMESTAMP(3),
ADD COLUMN     "eliminadaPorId" TEXT;

-- AddForeignKey
ALTER TABLE "ventana_carga" ADD CONSTRAINT "ventana_carga_eliminadaPorId_fkey" FOREIGN KEY ("eliminadaPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (mano, no generado por Prisma: la unicidad de `anio` debe regir solo mientras la
-- ventana no esté eliminada, y Prisma no expresa un índice único parcial (`WHERE`) en su schema
-- DSL. Sin esto, una ventana eliminada dejaría el año bloqueado para siempre.)
CREATE UNIQUE INDEX "ventana_carga_anio_no_eliminada_key" ON "ventana_carga"("anio") WHERE "eliminadaEn" IS NULL;
