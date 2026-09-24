-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "bloqueadaHasta" TIMESTAMP(3),
ADD COLUMN     "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sesionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vecesBloqueada" INTEGER NOT NULL DEFAULT 0;
