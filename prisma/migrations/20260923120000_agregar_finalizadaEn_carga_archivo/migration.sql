-- Corrección RF-14/RF-20: elimina la autoaprobación del notificador. El paso del notificador pasa
-- a ser "finalizar y enviar" (marca `finalizadaEn`, sin cambiar `estado`); la aprobación real la da
-- un tercero (ADMIN/REVISOR_REPOSITORIO) vía `darVistoBueno` extendido.

-- AlterTable
ALTER TABLE "carga_archivo" ADD COLUMN "finalizadaEn" TIMESTAMP(3);

-- Backfill (confirmado explícitamente): toda `PENDIENTE_VISTO_BUENO` que ya existe en la base fue
-- subida bajo el sistema viejo (autoaprobación); se trata como ya finalizada por el notificador,
-- para que quede inmediatamente disponible para que ADMIN/REVISOR_REPOSITORIO la decida, sin que el
-- notificador tenga que hacer nada retroactivo.
UPDATE "carga_archivo"
SET "finalizadaEn" = "createdAt"
WHERE "estado" = 'PENDIENTE_VISTO_BUENO' AND "finalizadaEn" IS NULL;
