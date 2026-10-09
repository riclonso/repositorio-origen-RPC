ALTER TYPE "TipoReglaValidacionFormatoExcel" ADD VALUE IF NOT EXISTS 'FECHA_POSTERIOR_O_IGUAL';
ALTER TABLE "regla_validacion_formato_excel" ADD COLUMN "configuracion" JSONB;
