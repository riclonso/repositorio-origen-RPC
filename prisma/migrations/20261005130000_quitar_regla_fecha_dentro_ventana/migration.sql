-- Quita la regla `FECHA_DENTRO_DE_VENTANA_VIGENTE`: se solapaba con
-- `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`. Se borra cualquier regla que la usara.
DELETE FROM "regla_validacion_formato_excel" WHERE "tipo" = 'FECHA_DENTRO_DE_VENTANA_VIGENTE';

-- PostgreSQL no permite quitar un valor de un enum: se recrea el tipo.
ALTER TYPE "TipoReglaValidacionFormatoExcel" RENAME TO "TipoReglaValidacionFormatoExcel_old";
CREATE TYPE "TipoReglaValidacionFormatoExcel" AS ENUM (
  'ALGUNA_COLUMNA_CON_VALOR',
  'FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA',
  'FILA_DUPLICADA',
  'RUT_VALIDO',
  'CONTENIDO_HTML',
  'FILA_VACIA'
);
ALTER TABLE "regla_validacion_formato_excel"
  ALTER COLUMN "tipo" TYPE "TipoReglaValidacionFormatoExcel" USING ("tipo"::text::"TipoReglaValidacionFormatoExcel");
DROP TYPE "TipoReglaValidacionFormatoExcel_old";
