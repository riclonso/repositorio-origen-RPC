-- RF-36: vigencia de la habilitación fuera de plazo (solicitud de reemplazo aprobada y reapertura
-- por rechazo) configurable por ventana, con un plazo único:
--   venceEl = max(ventana.fechaVencimiento, fin del día Chile de (fechaDecision + N días))
-- N se define por ventana (`diasVigenciaReemplazo`, 1..90, 7 por defecto) y se COPIA en la
-- solicitud (`diasVigencia`) o en el rechazo (`diasReapertura`) al decidir, para que editar la
-- ventana después no cambie un plazo ya otorgado.
--
-- Agregado a mano (Prisma no lo genera desde el schema): el backfill de los registros existentes y
-- los CHECK de rango/coherencia. Todo corre en la transacción de la migración.
--
-- Reversión manual (si hiciera falta):
--   ALTER TABLE "carga_archivo_rechazo" DROP COLUMN "diasReapertura";
--   ALTER TABLE "solicitud_reemplazo_carga" DROP COLUMN "diasVigencia";
--   ALTER TABLE "ventana_carga" DROP COLUMN "diasVigenciaReemplazo";

-- Ventanas: las existentes quedan en el valor por defecto (7).
ALTER TABLE "ventana_carga" ADD COLUMN "diasVigenciaReemplazo" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "ventana_carga" ADD CONSTRAINT "ventana_carga_dias_vigencia_reemplazo_rango"
  CHECK ("diasVigenciaReemplazo" BETWEEN 1 AND 90);

-- Solicitudes: nula mientras no esté APROBADA. Las APROBADA existentes (consumidas o no) quedan con
-- el valor fijo que regía al aprobarlas (5), para la consistencia del histórico.
ALTER TABLE "solicitud_reemplazo_carga" ADD COLUMN "diasVigencia" INTEGER;

UPDATE "solicitud_reemplazo_carga" SET "diasVigencia" = 5 WHERE "estado" = 'APROBADA';

ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_dias_vigencia_aprobada"
  CHECK ("estado" <> 'APROBADA' OR "diasVigencia" IS NOT NULL);

ALTER TABLE "solicitud_reemplazo_carga" ADD CONSTRAINT "solicitud_reemplazo_carga_dias_vigencia_rango"
  CHECK ("diasVigencia" IS NULL OR "diasVigencia" BETWEEN 1 AND 90);

-- Rechazos: todos los existentes quedan con el valor fijo que regía al rechazarlos (5). El DEFAULT
-- solo existe para el backfill y se quita enseguida: toda fila nueva debe traer el N de su ventana.
ALTER TABLE "carga_archivo_rechazo" ADD COLUMN "diasReapertura" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "carga_archivo_rechazo" ALTER COLUMN "diasReapertura" DROP DEFAULT;

ALTER TABLE "carga_archivo_rechazo" ADD CONSTRAINT "carga_archivo_rechazo_dias_reapertura_rango"
  CHECK ("diasReapertura" BETWEEN 1 AND 90);
