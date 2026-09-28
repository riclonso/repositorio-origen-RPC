-- Segunda parte del cambio "regla validar RUT + separador CSV". Va en una migración separada de
-- `20260928122036_agregar_separador_csv_y_regla_rut` porque PostgreSQL no permite usar un valor
-- de enum (`RUT_VALIDO`) en la misma transacción en que se agregó.

-- 1. Formatos CSV existentes: hasta ahora solo se leían con coma.
UPDATE "formato_excel" SET "separadorCsv" = 'COMA' WHERE "tipoArchivo" = 'CSV' AND "separadorCsv" IS NULL;

-- 2. `separadorCsv` es NULL si y solo si el formato es EXCEL.
ALTER TABLE "formato_excel"
  ADD CONSTRAINT "formato_excel_separador_csv_check"
  CHECK (("tipoArchivo" = 'CSV') = ("separadorCsv" IS NOT NULL));

-- 3. Cada columna con tipo de dato RUT pasa a ser TEXTO + una regla RUT_VALIDO sobre esa columna,
--    agregada al final de las reglas del formato (el orden es único por formato).
INSERT INTO "regla_validacion_formato_excel" ("id", "formatoExcelId", "orden", "tipo", "columnas", "mensaje")
SELECT
  gen_random_uuid()::text,
  c."formatoExcelId",
  COALESCE(m."maximo", 0) + ROW_NUMBER() OVER (PARTITION BY c."formatoExcelId" ORDER BY c."orden"),
  'RUT_VALIDO',
  ARRAY[c."nombre"],
  'El RUT de la columna "' || c."nombre" || '" no es válido'
FROM "columna_formato_excel" c
LEFT JOIN (
  SELECT "formatoExcelId", MAX("orden") AS "maximo"
  FROM "regla_validacion_formato_excel"
  GROUP BY "formatoExcelId"
) m ON m."formatoExcelId" = c."formatoExcelId"
WHERE c."tipoDato" = 'RUT';

UPDATE "columna_formato_excel" SET "tipoDato" = 'TEXTO' WHERE "tipoDato" = 'RUT';

-- 4. Recrear `TipoDatoColumna` sin RUT (PostgreSQL no permite quitar un valor de un enum).
--    Solo `columna_formato_excel."tipoDato"` usa este tipo.
ALTER TYPE "TipoDatoColumna" RENAME TO "TipoDatoColumna_old";
CREATE TYPE "TipoDatoColumna" AS ENUM ('TEXTO', 'ENTERO', 'DECIMAL', 'BOOLEANO', 'FECHA', 'FECHA_HORA', 'EMAIL');
ALTER TABLE "columna_formato_excel"
  ALTER COLUMN "tipoDato" TYPE "TipoDatoColumna" USING ("tipoDato"::text::"TipoDatoColumna");
DROP TYPE "TipoDatoColumna_old";
