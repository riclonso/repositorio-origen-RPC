-- Quita la regla `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` (fecha efectiva principal/alternativa
-- dentro del año de la ventana). Se borra cualquier regla que la usara.
DELETE FROM "regla_validacion_formato_excel" WHERE "tipo" = 'FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA';

-- PostgreSQL no permite quitar un valor de un enum: se recrea el tipo.
ALTER TYPE "TipoReglaValidacionFormatoExcel" RENAME TO "TipoReglaValidacionFormatoExcel_old";
CREATE TYPE "TipoReglaValidacionFormatoExcel" AS ENUM (
  'FECHA_POSTERIOR_O_IGUAL',
  'ALGUNA_COLUMNA_CON_VALOR',
  'FILA_DUPLICADA',
  'RUT_VALIDO',
  'CONTENIDO_HTML',
  'FILA_VACIA',
  'FECHA_NO_FUTURA',
  'COMPARACION_ANIO_VENTANA'
);
ALTER TABLE "regla_validacion_formato_excel"
  ALTER COLUMN "tipo" TYPE "TipoReglaValidacionFormatoExcel" USING ("tipo"::text::"TipoReglaValidacionFormatoExcel");
DROP TYPE "TipoReglaValidacionFormatoExcel_old";
