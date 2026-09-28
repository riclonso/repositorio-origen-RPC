-- CreateEnum
CREATE TYPE "SeparadorCsv" AS ENUM ('COMA', 'PUNTO_Y_COMA', 'TABULADOR', 'BARRA_VERTICAL');

-- AlterEnum
ALTER TYPE "TipoReglaValidacionFormatoExcel" ADD VALUE 'RUT_VALIDO';

-- AlterTable
ALTER TABLE "formato_excel" ADD COLUMN     "separadorCsv" "SeparadorCsv";
