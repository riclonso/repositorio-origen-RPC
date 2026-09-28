-- Distingue el origen de una `SolicitudReemplazoCarga`: reemplazo de una carga ya `APROBADA`
-- (camino original) vs. reemplazo de una carga `PENDIENTE_VISTO_BUENO` ya finalizada por el
-- notificador y todavía sin decisión de un ADMIN/REVISOR_REPOSITORIO (camino nuevo, ver diseño
-- aprobado). Aditiva: agrega el enum y la columna con valor por defecto para las filas existentes
-- (todas nacieron por el camino `CARGA_APROBADA`, el único que existía hasta ahora), luego quita
-- el default para que el servidor deba fijarlo siempre de forma explícita en las escrituras nuevas.

CREATE TYPE "OrigenSolicitudReemplazoCarga" AS ENUM ('CARGA_APROBADA', 'CARGA_PENDIENTE_DECISION');

ALTER TABLE "solicitud_reemplazo_carga"
  ADD COLUMN "origen" "OrigenSolicitudReemplazoCarga" NOT NULL DEFAULT 'CARGA_APROBADA';

ALTER TABLE "solicitud_reemplazo_carga" ALTER COLUMN "origen" DROP DEFAULT;
