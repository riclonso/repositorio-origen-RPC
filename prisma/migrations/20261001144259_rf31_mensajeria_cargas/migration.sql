-- RF-31: mensajería entre REVISOR_REPOSITORIO y NOTIFICADOR_RPC sobre cargas de archivo. Tabla
-- nueva, sin migración de datos. Reversible con
-- `DROP TABLE "mensaje_carga"; DROP TYPE "LadoMensajeCarga";`.
--
-- Agregado a mano (Prisma no lo genera desde el schema): el CHECK de coherencia de lado, al final.

-- CreateEnum
CREATE TYPE "LadoMensajeCarga" AS ENUM ('REVISOR', 'NOTIFICADOR');

-- CreateTable
CREATE TABLE "mensaje_carga" (
    "id" TEXT NOT NULL,
    "cargaArchivoId" TEXT NOT NULL,
    "ventanaCargaId" TEXT NOT NULL,
    "notificadorId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "ladoAutor" "LadoMensajeCarga" NOT NULL,
    "contenido" VARCHAR(1000) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leidoEn" TIMESTAMP(3),

    CONSTRAINT "mensaje_carga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensaje_carga_notificadorId_ventanaCargaId_creadoEn_idx" ON "mensaje_carga"("notificadorId", "ventanaCargaId", "creadoEn");

-- CreateIndex
CREATE INDEX "mensaje_carga_ventanaCargaId_ladoAutor_leidoEn_idx" ON "mensaje_carga"("ventanaCargaId", "ladoAutor", "leidoEn");

-- CreateIndex
CREATE INDEX "mensaje_carga_autorId_idx" ON "mensaje_carga"("autorId");

-- AddForeignKey
ALTER TABLE "mensaje_carga" ADD CONSTRAINT "mensaje_carga_cargaArchivoId_fkey" FOREIGN KEY ("cargaArchivoId") REFERENCES "carga_archivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_carga" ADD CONSTRAINT "mensaje_carga_ventanaCargaId_fkey" FOREIGN KEY ("ventanaCargaId") REFERENCES "ventana_carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_carga" ADD CONSTRAINT "mensaje_carga_notificadorId_fkey" FOREIGN KEY ("notificadorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje_carga" ADD CONSTRAINT "mensaje_carga_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Agregado a mano: un mensaje del lado NOTIFICADOR solo puede tener como autor al propio
-- notificador del hilo. Red de seguridad ante un INSERT manual; la aplicación nunca lo construye.
ALTER TABLE "mensaje_carga" ADD CONSTRAINT "mensaje_carga_lado_autor_coherente"
  CHECK ("ladoAutor" <> 'NOTIFICADOR' OR "autorId" = "notificadorId");
