-- ============================================================================
-- Script SQL avanzado para limpiar la base de datos
-- ============================================================================
-- Funciones para eliminar usuarios, cargas, y generar reportes.
--
-- ADVERTENCIA: Operaciones IRREVERSIBLES. Respalda antes.
--
-- Uso:
--   psql -h localhost -U usuario -d repositorio-rem -c "
--     SELECT limpiar_usuario('550e8400-e29b-41d4-a716-446655440000');
--   "
-- ============================================================================

-- ============================================================================
-- 1. FUNCIÓN: Reporte de usuario a eliminar
-- ============================================================================
CREATE OR REPLACE FUNCTION reportar_usuario(p_usuario_id UUID)
RETURNS TABLE (
  rut VARCHAR,
  nombres VARCHAR,
  apellidos VARCHAR,
  perfil VARCHAR,
  cargas_archivo BIGINT,
  cargas_bioestadistica BIGINT,
  mensajes BIGINT,
  alertas BIGINT,
  ventanas_creadas BIGINT,
  solicitudes_reemplazo BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.rut,
    u.nombres,
    u.apellidos,
    u."perfilCodigo",
    COUNT(DISTINCT ca.id)::BIGINT,
    COUNT(DISTINCT cb.id)::BIGINT,
    COUNT(DISTINCT mc.id)::BIGINT,
    COUNT(DISTINCT anv.id)::BIGINT,
    COUNT(DISTINCT vc.id)::BIGINT,
    COUNT(DISTINCT src.id)::BIGINT
  FROM usuario u
  LEFT JOIN carga_archivo ca ON u.id = ca."usuarioId"
  LEFT JOIN carga_bioestadistica cb ON u.id = cb."usuarioId"
  LEFT JOIN mensaje_carga mc ON u.id = mc."autorId" OR u.id = mc."notificadorId"
  LEFT JOIN alerta_notificacion_ventana anv ON u.id = anv."usuarioId" OR u.id = anv."disparadoPorId"
  LEFT JOIN ventana_carga vc ON u.id = vc."creadoPorId" OR u.id = vc."eliminadaPorId"
  LEFT JOIN solicitud_reemplazo_carga src ON u.id = src."solicitadoPorId" OR u.id = src."revisadoPorId"
  WHERE u.id = p_usuario_id
  GROUP BY u.id, u.rut, u.nombres, u.apellidos, u."perfilCodigo";
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. FUNCIÓN: Contar registros a eliminar
-- ============================================================================
CREATE OR REPLACE FUNCTION contar_a_eliminar(p_usuario_id UUID)
RETURNS TABLE (
  tabla VARCHAR,
  cantidad BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'mensaje_carga'::VARCHAR, COUNT(*)
  FROM mensaje_carga WHERE "autorId" = p_usuario_id OR "notificadorId" = p_usuario_id
  UNION ALL
  SELECT 'alerta_notificacion_ventana'::VARCHAR, COUNT(*)
  FROM alerta_notificacion_ventana WHERE "usuarioId" = p_usuario_id OR "disparadoPorId" = p_usuario_id
  UNION ALL
  SELECT 'solicitud_reemplazo_bioestadistica'::VARCHAR, COUNT(*)
  FROM solicitud_reemplazo_bioestadistica WHERE "solicitadoPorId" = p_usuario_id OR "revisadoPorId" = p_usuario_id
  UNION ALL
  SELECT 'carga_bioestadistica'::VARCHAR, COUNT(*)
  FROM carga_bioestadistica WHERE "usuarioId" = p_usuario_id
  UNION ALL
  SELECT 'carga_archivo_rechazo'::VARCHAR, COUNT(*)
  FROM carga_archivo_rechazo WHERE "cargaArchivoId" IN (
    SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
  )
  UNION ALL
  SELECT 'solicitud_reemplazo_carga'::VARCHAR, COUNT(*)
  FROM solicitud_reemplazo_carga WHERE "cargaArchivoId" IN (
    SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
  ) OR "solicitadoPorId" = p_usuario_id OR "revisadoPorId" = p_usuario_id
  UNION ALL
  SELECT 'carga_archivo_publicada'::VARCHAR, COUNT(*)
  FROM carga_archivo_publicada WHERE "cargaArchivoId" IN (
    SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
  ) OR "publicadoPorId" = p_usuario_id
  UNION ALL
  SELECT 'carga_archivo'::VARCHAR, COUNT(*)
  FROM carga_archivo WHERE "usuarioId" = p_usuario_id OR "vistoBuenoPorId" = p_usuario_id
  UNION ALL
  SELECT 'ventana_carga'::VARCHAR, COUNT(*)
  FROM ventana_carga WHERE "creadoPorId" = p_usuario_id OR "eliminadaPorId" = p_usuario_id
  UNION ALL
  SELECT 'token_recuperacion_contrasena'::VARCHAR, COUNT(*)
  FROM token_recuperacion_contrasena WHERE "usuarioId" = p_usuario_id
  UNION ALL
  SELECT 'usuario_formato_excel'::VARCHAR, COUNT(*)
  FROM usuario_formato_excel WHERE "usuarioId" = p_usuario_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. FUNCIÓN: Eliminar usuario en cascada
-- ============================================================================
CREATE OR REPLACE FUNCTION limpiar_usuario(p_usuario_id UUID)
RETURNS TABLE (
  exito BOOLEAN,
  usuarios_eliminados INT,
  registros_eliminados INT,
  mensaje VARCHAR
) AS $$
DECLARE
  v_usuario_existe BOOLEAN;
  v_total_eliminados INT := 0;
BEGIN
  -- Verificar que el usuario existe
  SELECT EXISTS(SELECT 1 FROM usuario WHERE id = p_usuario_id) INTO v_usuario_existe;

  IF NOT v_usuario_existe THEN
    RETURN QUERY SELECT FALSE, 0, 0, 'Usuario no encontrado'::VARCHAR;
    RETURN;
  END IF;

  BEGIN
    -- Iniciar transacción
    DELETE FROM mensaje_carga WHERE "autorId" = p_usuario_id OR "notificadorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM alerta_notificacion_ventana WHERE "usuarioId" = p_usuario_id OR "disparadoPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM solicitud_reemplazo_bioestadistica WHERE "solicitadoPorId" = p_usuario_id OR "revisadoPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM carga_bioestadistica WHERE "usuarioId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM carga_archivo_rechazo WHERE "cargaArchivoId" IN (
      SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
    );
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM solicitud_reemplazo_carga WHERE "cargaArchivoId" IN (
      SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
    ) OR "solicitadoPorId" = p_usuario_id OR "revisadoPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM carga_archivo_publicada WHERE "cargaArchivoId" IN (
      SELECT id FROM carga_archivo WHERE "usuarioId" = p_usuario_id
    ) OR "publicadoPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM carga_archivo WHERE "usuarioId" = p_usuario_id OR "vistoBuenoPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM ventana_carga WHERE "creadoPorId" = p_usuario_id OR "eliminadaPorId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM token_recuperacion_contrasena WHERE "usuarioId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM usuario_formato_excel WHERE "usuarioId" = p_usuario_id;
    v_total_eliminados := v_total_eliminados + FOUND::INT;

    DELETE FROM usuario WHERE id = p_usuario_id;

    RETURN QUERY SELECT TRUE, 1, v_total_eliminados, 'Usuario y su historial eliminados'::VARCHAR;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, 0, 0, ('Error: ' || SQLERRM)::VARCHAR;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. FUNCIÓN: Eliminar por RUT
-- ============================================================================
CREATE OR REPLACE FUNCTION limpiar_por_rut(p_rut VARCHAR)
RETURNS TABLE (
  exito BOOLEAN,
  usuarios_eliminados INT,
  registros_eliminados INT,
  mensaje VARCHAR
) AS $$
DECLARE
  v_usuario_id UUID;
BEGIN
  SELECT id INTO v_usuario_id FROM usuario WHERE rut = p_rut LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 0, 0, ('Usuario con RUT ' || p_rut || ' no encontrado')::VARCHAR;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM limpiar_usuario(v_usuario_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FUNCIÓN: Reportar todos los usuarios
-- ============================================================================
CREATE OR REPLACE FUNCTION reportar_usuarios()
RETURNS TABLE (
  rut VARCHAR,
  nombres VARCHAR,
  apellidos VARCHAR,
  perfil VARCHAR,
  cargas_archivo BIGINT,
  cargas_bioestadistica BIGINT,
  mensajes BIGINT,
  total_registros BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.rut,
    u.nombres,
    u.apellidos,
    u."perfilCodigo",
    COUNT(DISTINCT ca.id)::BIGINT,
    COUNT(DISTINCT cb.id)::BIGINT,
    COUNT(DISTINCT mc.id)::BIGINT,
    (COUNT(DISTINCT ca.id) + COUNT(DISTINCT cb.id) + COUNT(DISTINCT mc.id))::BIGINT
  FROM usuario u
  LEFT JOIN carga_archivo ca ON u.id = ca."usuarioId"
  LEFT JOIN carga_bioestadistica cb ON u.id = cb."usuarioId"
  LEFT JOIN mensaje_carga mc ON u.id = mc."autorId" OR u.id = mc."notificadorId"
  GROUP BY u.id, u.rut, u.nombres, u.apellidos, u."perfilCodigo"
  ORDER BY total_registros DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EJEMPLOS DE USO:
-- ============================================================================

-- Ver reporte de todos los usuarios:
-- SELECT * FROM reportar_usuarios();

-- Ver datos específicos de un usuario antes de eliminar:
-- SELECT * FROM reportar_usuario('550e8400-e29b-41d4-a716-446655440000');

-- Contar qué se va a eliminar:
-- SELECT * FROM contar_a_eliminar('550e8400-e29b-41d4-a716-446655440000');

-- ELIMINAR un usuario por ID:
-- SELECT * FROM limpiar_usuario('550e8400-e29b-41d4-a716-446655440000');

-- ELIMINAR un usuario por RUT:
-- SELECT * FROM limpiar_por_rut('12345678-9');

-- ============================================================================
-- FIN DEL SCRIPT DE FUNCIONES
-- ============================================================================
