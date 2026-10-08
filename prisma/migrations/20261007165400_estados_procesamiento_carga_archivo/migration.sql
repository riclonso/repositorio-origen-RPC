-- D1 (M1a): solo valores de enum, en su PROPIA migración: PostgreSQL no permite usar un valor de
-- enum en la misma transacción en que se agrega, y M1b los usa (índice parcial sobre PROCESANDO).
-- Mismo precedente que `20260923090000_agregar_estado_rechazada_carga` (RF-20).

-- AlterEnum
ALTER TYPE "EstadoCargaArchivo" ADD VALUE 'PROCESANDO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoErrorCargaArchivo" ADD VALUE 'TOPE_FILAS_EXCEDIDO';
ALTER TYPE "TipoErrorCargaArchivo" ADD VALUE 'ARCHIVO_NO_PROCESADO';
ALTER TYPE "TipoErrorCargaArchivo" ADD VALUE 'TEXTO_ENRIQUECIDO';
