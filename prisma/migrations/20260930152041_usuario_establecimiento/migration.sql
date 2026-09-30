-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "establecimientoId" TEXT;

-- CreateIndex
CREATE INDEX "usuario_establecimientoId_idx" ON "usuario"("establecimientoId");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_establecimientoId_fkey" FOREIGN KEY ("establecimientoId") REFERENCES "establecimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
