-- CreateEnum
CREATE TYPE "TipoDatoColumna" AS ENUM ('TEXTO', 'ENTERO', 'DECIMAL', 'BOOLEANO', 'FECHA', 'FECHA_HORA');

-- CreateTable
CREATE TABLE "formato_excel" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "nombreArchivoPlantilla" TEXT NOT NULL,
    "tipoContenidoPlantilla" TEXT NOT NULL,
    "contenidoPlantilla" BYTEA NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formato_excel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "columna_formato_excel" (
    "id" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "requerida" BOOLEAN NOT NULL DEFAULT false,
    "tipoDato" "TipoDatoColumna" NOT NULL,

    CONSTRAINT "columna_formato_excel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_formato_excel" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "formatoExcelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_formato_excel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formato_excel_nombre_key" ON "formato_excel"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "columna_formato_excel_formatoExcelId_orden_key" ON "columna_formato_excel"("formatoExcelId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "columna_formato_excel_formatoExcelId_nombre_key" ON "columna_formato_excel"("formatoExcelId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_formato_excel_usuarioId_formatoExcelId_key" ON "usuario_formato_excel"("usuarioId", "formatoExcelId");

-- AddForeignKey
ALTER TABLE "columna_formato_excel" ADD CONSTRAINT "columna_formato_excel_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_formato_excel" ADD CONSTRAINT "usuario_formato_excel_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_formato_excel" ADD CONSTRAINT "usuario_formato_excel_formatoExcelId_fkey" FOREIGN KEY ("formatoExcelId") REFERENCES "formato_excel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
