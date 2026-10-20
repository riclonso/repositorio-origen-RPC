-- ============================================================================
-- Eliminar TODAS las ventanas de carga y sus datos asociados (PostgreSQL 18)
-- ============================================================================
--
-- ADVERTENCIA: IRREVERSIBLE si se confirma. Respaldar la base antes.
--
-- Borra, en este orden:
--   1. Mensajes de revisión (mensaje_carga) de las ventanas y sus cargas.
--   2. Alertas de notificación de las ventanas (alerta_notificacion_ventana).
--   3. Publicaciones (carga_archivo_publicada, y sus filas en cascada),
--      rechazos, solicitudes de reemplazo y errores de carga de las cargas.
--   4. Las cargas de archivo (carga_archivo).
--   5. Las ventanas (ventana_carga).
--
-- NO borra: formatos de archivo, usuarios, cargas de Bioestadística ni
-- lecturas de notificación (estas últimas no tienen FK a la ventana).
--
-- Uso desde consola remota (psql):
--   \i scripts/eliminar-todas-las-ventanas.sql
--
-- Termina en ROLLBACK. Para aplicar, cambiar la última sentencia útil a COMMIT.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- 0. Verificación previa
-- ============================================================================

SELECT
  (SELECT count(*) FROM ventana_carga)                                          AS ventanas,
  (SELECT count(*) FROM carga_archivo)                                          AS cargas,
  (SELECT count(*) FROM carga_archivo_publicada)                                AS publicadas,
  (SELECT count(*) FROM carga_archivo_rechazo)                                  AS rechazos,
  (SELECT count(*) FROM solicitud_reemplazo_carga)                              AS solicitudes_reemplazo,
  (SELECT count(*) FROM error_carga_archivo)                                    AS errores_carga,
  (SELECT count(*) FROM mensaje_carga)                                          AS mensajes,
  (SELECT count(*) FROM alerta_notificacion_ventana)                            AS alertas;

-- ============================================================================
-- 1. Conjuntos de ids afectados (temporales, se descartan al cerrar la transacción)
-- ============================================================================

CREATE TEMP TABLE ventanas_afectadas ON COMMIT DROP AS
SELECT id FROM ventana_carga;

CREATE TEMP TABLE cargas_afectadas ON COMMIT DROP AS
SELECT id FROM carga_archivo
WHERE "ventanaCargaId" IN (SELECT id FROM ventanas_afectadas);

-- ============================================================================
-- 2. Hijos con RESTRICT que apuntan a las cargas o a las ventanas
-- ============================================================================

DELETE FROM mensaje_carga
WHERE "ventanaCargaId" IN (SELECT id FROM ventanas_afectadas)
   OR "cargaArchivoId" IN (SELECT id FROM cargas_afectadas);

DELETE FROM alerta_notificacion_ventana
WHERE "ventanaCargaId" IN (SELECT id FROM ventanas_afectadas);

-- Publicaciones: el borrado de la publicación arrastra sus filas (CASCADE).
-- Se borran antes que las cargas porque su FK a la carga es RESTRICT.
DELETE FROM carga_archivo_publicada
WHERE "cargaArchivoId" IN (SELECT id FROM cargas_afectadas)
   OR "reemplazadaPorCargaArchivoId" IN (SELECT id FROM cargas_afectadas);

DELETE FROM carga_archivo_rechazo
WHERE "cargaArchivoId" IN (SELECT id FROM cargas_afectadas)
   OR "reaperturaConsumidaPorCargaArchivoId" IN (SELECT id FROM cargas_afectadas);

DELETE FROM solicitud_reemplazo_carga
WHERE "cargaArchivoId" IN (SELECT id FROM cargas_afectadas)
   OR "nuevaCargaArchivoId" IN (SELECT id FROM cargas_afectadas);

-- Errores de carga: CASCADE desde carga_archivo, se borran explícitamente igual.
DELETE FROM error_carga_archivo
WHERE "cargaArchivoId" IN (SELECT id FROM cargas_afectadas);

-- ============================================================================
-- 3. Cargas y ventanas
-- ============================================================================

DELETE FROM carga_archivo
WHERE id IN (SELECT id FROM cargas_afectadas);

DELETE FROM ventana_carga
WHERE id IN (SELECT id FROM ventanas_afectadas);

-- ============================================================================
-- 4. Verificación final (debe devolver ceros en ventanas y cargas)
-- ============================================================================

SELECT
  (SELECT count(*) FROM ventana_carga)                               AS ventanas_restantes,
  (SELECT count(*) FROM carga_archivo)                               AS cargas_restantes,
  (SELECT count(*) FROM carga_archivo_publicada)                     AS publicadas_restantes,
  (SELECT count(*) FROM carga_archivo_rechazo)                       AS rechazos_restantes,
  (SELECT count(*) FROM solicitud_reemplazo_carga)                   AS solicitudes_restantes,
  (SELECT count(*) FROM error_carga_archivo)                         AS errores_restantes,
  (SELECT count(*) FROM mensaje_carga)                               AS mensajes_restantes,
  (SELECT count(*) FROM alerta_notificacion_ventana)                 AS alertas_restantes;

-- DESCOMENTAR PARA CONFIRMAR (y comentar la línea siguiente):
-- COMMIT;

ROLLBACK;
