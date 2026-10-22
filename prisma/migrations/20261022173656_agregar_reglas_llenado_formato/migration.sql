-- CreateTable
CREATE TABLE "reglas_llenado_formato" (
    "id" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "nombreArchivoOriginal" VARCHAR(255) NOT NULL,
    "extension" VARCHAR(4) NOT NULL,
    "tipoContenido" TEXT NOT NULL,
    "rutaArchivo" TEXT NOT NULL,
    "tamanoBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "subidoPorId" TEXT NOT NULL,
    "subidoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reglas_llenado_formato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reglas_llenado_formato_formatoExcelId_key" ON "reglas_llenado_formato"("formatoExcelId");

-- CreateIndex
CREATE INDEX "reglas_llenado_formato_subidoPorId_idx" ON "reglas_llenado_formato"("subidoPorId");

-- AddForeignKey
ALTER TABLE "reglas_llenado_formato" ADD CONSTRAINT "reglas_llenado_formato_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglas_llenado_formato" ADD CONSTRAINT "reglas_llenado_formato_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RF-45: lista blanca de extensiones y tamaño positivo también en la base (defensa en profundidad).
ALTER TABLE "reglas_llenado_formato" ADD CONSTRAINT "reglas_llenado_formato_extension_check" CHECK ("extension" IN ('docx', 'doc', 'xlsx', 'xls', 'txt'));
ALTER TABLE "reglas_llenado_formato" ADD CONSTRAINT "reglas_llenado_formato_tamano_check" CHECK ("tamanoBytes" > 0);
