-- Quita `FECHA_HORA` de `TipoDatoColumna`: las columnas de fecha solo validan la fecha.
-- Toda columna que lo tuviera pasa a `FECHA` (en xlsx ambas aceptaban lo mismo).
UPDATE "columna_formato_excel" SET "tipoDato" = 'FECHA' WHERE "tipoDato" = 'FECHA_HORA';

-- PostgreSQL no permite quitar un valor de un enum: se recrea el tipo.
ALTER TYPE "TipoDatoColumna" RENAME TO "TipoDatoColumna_old";
CREATE TYPE "TipoDatoColumna" AS ENUM ('TEXTO', 'ENTERO', 'DECIMAL', 'BOOLEANO', 'FECHA', 'EMAIL');
ALTER TABLE "columna_formato_excel"
  ALTER COLUMN "tipoDato" TYPE "TipoDatoColumna" USING ("tipoDato"::text::"TipoDatoColumna");
DROP TYPE "TipoDatoColumna_old";
