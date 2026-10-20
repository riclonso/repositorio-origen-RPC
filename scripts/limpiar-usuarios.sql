-- ============================================================================
-- Script SQL para limpiar usuarios e historial de cargas
-- ============================================================================
-- Elimina usuarios por ID junto con TODO su historial en cascada.
--
-- ADVERTENCIA: Esta operación es IRREVERSIBLE. Respalda la BD antes.
--
-- Uso:
--   psql -h localhost -U usuario -d repositorio-rem -f limpiar-usuarios.sql
--
-- O editar los IDs en la tabla temporal y ejecutar en psql directamente.
-- ============================================================================

-- 1. Crear tabla temporal con IDs a eliminar
-- EDITA ESTOS IDS CON LOS QUE QUIERES ELIMINAR:
CREATE TEMP TABLE ids_a_eliminar (id UUID PRIMARY KEY);

INSERT INTO ids_a_eliminar VALUES
  ('550e8400-e29b-41d4-a716-446655440000'),  -- Reemplazar con ID real
  ('6ba7b810-9dad-11d1-80b4-00c04fd430c8'); -- Reemplazar con ID real

-- 2. Verificar usuarios a eliminar
SELECT
  u.id,
  u.rut,
  u.nombres,
  u.apellidos,
  u.perfilCodigo,
  COUNT(DISTINCT ca.id) as cargas_archivo,
  COUNT(DISTINCT cb.id) as cargas_bioestadistica,
  COUNT(DISTINCT mc.id) as mensajes
FROM usuario u
LEFT JOIN ids_a_eliminar ia ON u.id = ia.id
LEFT JOIN carga_archivo ca ON u.id = ca."usuarioId"
LEFT JOIN carga_bioestadistica cb ON u.id = cb."usuarioId"
LEFT JOIN mensaje_carga mc ON u.id = mc."autorId" OR u.id = mc."notificadorId"
WHERE ia.id IS NOT NULL
GROUP BY u.id, u.rut, u.nombres, u.apellidos, u.perfilCodigo;

-- Si el SELECT anterior devuelve 0 filas, no hay usuarios para eliminar. DETENTE AQUÍ.

-- ============================================================================
-- INICIO DE LA TRANSACCIÓN. Comentar/descomentar según necesidad.
-- ============================================================================

BEGIN TRANSACTION;

-- 3. Guardar copia de datos a eliminar para auditoría (opcional)
CREATE TEMP TABLE auditoria_eliminacion AS
SELECT
  'usuario' as tabla,
  u.id,
  u.rut,
  u.nombres,
  u.apellidos,
  NOW() as eliminado_en,
  CURRENT_USER as eliminado_por
FROM usuario u
WHERE u.id IN (SELECT id FROM ids_a_eliminar);

-- 4. Eliminar mensajes de carga
DELETE FROM mensaje_carga mc
WHERE mc."autorId" IN (SELECT id FROM ids_a_eliminar)
   OR mc."notificadorId" IN (SELECT id FROM ids_a_eliminar);

-- 5. Eliminar alertas de notificación
DELETE FROM alerta_notificacion_ventana anv
WHERE anv."usuarioId" IN (SELECT id FROM ids_a_eliminar)
   OR anv."disparadoPorId" IN (SELECT id FROM ids_a_eliminar);

-- 6. Eliminar solicitudes de reemplazo de Bioestadística
DELETE FROM solicitud_reemplazo_bioestadistica srb
WHERE srb."solicitadoPorId" IN (SELECT id FROM ids_a_eliminar)
   OR srb."revisadoPorId" IN (SELECT id FROM ids_a_eliminar);

-- 7. Eliminar cargas de Bioestadística
DELETE FROM carga_bioestadistica cb
WHERE cb."usuarioId" IN (SELECT id FROM ids_a_eliminar);

-- 8. Eliminar archivos de cargas (registros en carga_archivo_rechazo, reemplazo, publicada)
DELETE FROM carga_archivo_rechazo car
WHERE car."cargaArchivoId" IN (
  SELECT id FROM carga_archivo ca
  WHERE ca."usuarioId" IN (SELECT id FROM ids_a_eliminar)
);

DELETE FROM solicitud_reemplazo_carga src
WHERE src."cargaArchivoId" IN (
  SELECT id FROM carga_archivo ca
  WHERE ca."usuarioId" IN (SELECT id FROM ids_a_eliminar)
)
OR src."solicitadoPorId" IN (SELECT id FROM ids_a_eliminar)
OR src."revisadoPorId" IN (SELECT id FROM ids_a_eliminar);

DELETE FROM carga_archivo_publicada_fila capf
WHERE capf."cargaArchivoPublicadaId" IN (
  SELECT id FROM carga_archivo_publicada cap
  WHERE cap."cargaArchivoId" IN (
    SELECT id FROM carga_archivo ca
    WHERE ca."usuarioId" IN (SELECT id FROM ids_a_eliminar)
  )
);

DELETE FROM carga_archivo_publicada cap
WHERE cap."cargaArchivoId" IN (
  SELECT id FROM carga_archivo ca
  WHERE ca."usuarioId" IN (SELECT id FROM ids_a_eliminar)
)
OR cap."publicadoPorId" IN (SELECT id FROM ids_a_eliminar);

DELETE FROM carga_archivo ca
WHERE ca."usuarioId" IN (SELECT id FROM ids_a_eliminar)
   OR ca."vistoBuenoPorId" IN (SELECT id FROM ids_a_eliminar);

-- 9. Eliminar ventanas de carga creadas por el usuario
DELETE FROM ventana_carga vc
WHERE vc."creadoPorId" IN (SELECT id FROM ids_a_eliminar)
   OR vc."eliminadaPorId" IN (SELECT id FROM ids_a_eliminar);

-- 10. Eliminar tokens de recuperación de contraseña
DELETE FROM token_recuperacion_contrasena trc
WHERE trc."usuarioId" IN (SELECT id FROM ids_a_eliminar);

-- 11. Eliminar asignaciones de formatos
DELETE FROM usuario_formato_excel ufe
WHERE ufe."usuarioId" IN (SELECT id FROM ids_a_eliminar);

-- 12. Finalmente, eliminar usuarios
DELETE FROM usuario u
WHERE u.id IN (SELECT id FROM ids_a_eliminar);

-- ============================================================================
-- Revertir cambios (descomenta ROLLBACK si quieres deshacer):
-- ============================================================================

-- ROLLBACK;  -- Deshacer todo
-- COMMIT;    -- Confirmar cambios (por defecto al final del script)

COMMIT;

-- 13. Verificación final: confirmar que se eliminaron
SELECT
  'Eliminación completada' as resultado,
  (SELECT COUNT(*) FROM usuario WHERE id IN (SELECT id FROM ids_a_eliminar)) as usuarios_restantes,
  NOW() as timestamp;
