-- Tipos de dato enumerados definidos por el usuario (paso 2 de 2).

-- CreateTable
CREATE TABLE "tipo_enumerado_formato_excel" (
    "id" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "valores" TEXT[],

    CONSTRAINT "tipo_enumerado_formato_excel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_enumerado_formato_excel_formatoExcelId_orden_key" ON "tipo_enumerado_formato_excel"("formatoExcelId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_enumerado_formato_excel_formatoExcelId_nombre_key" ON "tipo_enumerado_formato_excel"("formatoExcelId", "nombre");

-- AddForeignKey
ALTER TABLE "tipo_enumerado_formato_excel" ADD CONSTRAINT "tipo_enumerado_formato_excel_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "columna_formato_excel" ADD COLUMN "tipoEnumeradoNombre" TEXT;

-- Escrito a mano (Prisma no modela CHECK), mismo precedente que `separadorCsv`: una columna
-- referencia un tipo enumerado si y solo si su tipo de dato es ENUMERADO. Las columnas existentes
-- quedan con `tipoEnumeradoNombre` NULL y ningún tipo ENUMERADO, así que cumplen la restricción.
ALTER TABLE "columna_formato_excel"
  ADD CONSTRAINT "columna_formato_excel_tipo_enumerado_check"
  CHECK (("tipoDato" = 'ENUMERADO') = ("tipoEnumeradoNombre" IS NOT NULL));
