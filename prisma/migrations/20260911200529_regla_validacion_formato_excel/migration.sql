-- CreateEnum
CREATE TYPE "TipoReglaValidacionFormatoExcel" AS ENUM ('ALGUNA_COLUMNA_CON_VALOR');

-- CreateTable
CREATE TABLE "regla_validacion_formato_excel" (
    "id" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" "TipoReglaValidacionFormatoExcel" NOT NULL,
    "columnas" TEXT[],
    "mensaje" TEXT NOT NULL,

    CONSTRAINT "regla_validacion_formato_excel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regla_validacion_formato_excel_formatoExcelId_orden_key" ON "regla_validacion_formato_excel"("formatoExcelId", "orden");

-- AddForeignKey
ALTER TABLE "regla_validacion_formato_excel" ADD CONSTRAINT "regla_validacion_formato_excel_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
