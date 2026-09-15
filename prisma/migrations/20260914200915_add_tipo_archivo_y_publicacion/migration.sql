-- RF-15 (ampliación): tipo de archivo (EXCEL/CSV) por formato y por ventana de carga, y bandera
-- de publicación de la ventana. El backfill de `tipoArchivo` NO lo genera Prisma automáticamente
-- (las columnas nacen `NOT NULL` sin default): se agrega a mano, mismo mecanismo ya usado en
-- RF-09/RF-14/RF-15 para insertar datos fuera del DDL generado.

-- CreateEnum
CREATE TYPE "TipoArchivo" AS ENUM ('EXCEL', 'CSV');

-- AlterTable: columna nueva NULLABLE primero, se backfillea a partir del tipo de contenido real
-- ya persistido en `tipoContenidoPlantilla` y luego se fija NOT NULL.
ALTER TABLE "formato_excel" ADD COLUMN "tipoArchivo" "TipoArchivo";

-- Backfill determinista: los dos únicos valores de tipo de contenido que el sistema acepta hoy
-- (ver `TIPO_CONTENIDO_XLSX`/`TIPO_CONTENIDO_CSV` en `app/api/formatos-excel/_lib/http.ts`) mapean
-- 1:1 a un valor del enum, sin ambigüedad.
UPDATE "formato_excel"
SET "tipoArchivo" = CASE "tipoContenidoPlantilla"
  WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'EXCEL'::"TipoArchivo"
  WHEN 'text/csv' THEN 'CSV'::"TipoArchivo"
END;

-- AlterTable: ahora sí, NOT NULL.
ALTER TABLE "formato_excel" ALTER COLUMN "tipoArchivo" SET NOT NULL;

-- AlterTable: mismo patrón para `ventana_carga`. No hay forma de derivar el tipo de archivo de una
-- ventana ya creada (RF-15 no lo pedía), así que el backfill es arbitrario por decisión explícita
-- del usuario: todas las ventanas ya creadas quedan como EXCEL.
ALTER TABLE "ventana_carga" ADD COLUMN "tipoArchivo" "TipoArchivo";

UPDATE "ventana_carga" SET "tipoArchivo" = 'EXCEL';

ALTER TABLE "ventana_carga" ALTER COLUMN "tipoArchivo" SET NOT NULL;

-- AlterTable: `publicada` no necesita backfill ambiguo, nace en `false` (borrador) para todas las
-- filas existentes, un solo paso.
ALTER TABLE "ventana_carga" ADD COLUMN "publicada" BOOLEAN NOT NULL DEFAULT false;
