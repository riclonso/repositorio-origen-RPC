-- ============================================================================
-- Eliminar ventanas de carga y los formatos de archivo asociados a ellas
-- PostgreSQL 18
-- ============================================================================
--
-- Qué hace:
--   1. Toma la lista de ventanas indicadas en la sección "IDS DE VENTANAS".
--   2. Aborta si alguna ventana tiene cargas o mensajes (historial que no se borra).
--   3. Borra las alertas de esas ventanas y luego las ventanas.
--   4. Borra cada formato que tenía una de esas ventanas SOLO si ninguna otra
--      ventana, carga ni asignación de usuario lo sigue usando. Las columnas,
--      tipos enumerados y reglas de validación del formato se eliminan en cascada.
--
-- Uso (siempre en una base desechable primero):
--   psql -h localhost -p 5435 -U postgres -d Repo_origen_RPC -f scripts/eliminar-ventanas-y-formatos.sql
--
-- Por defecto termina en ROLLBACK. Para aplicar, cambia la última línea a COMMIT.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- IDS DE VENTANAS A ELIMINAR (editar esta lista)
-- ============================================================================

CREATE TEMP TABLE ventanas_objetivo (id text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO ventanas_objetivo (id) VALUES
  ('00000000-0000-0000-0000-000000000000')
;

-- ============================================================================
-- 1. Verificación: ventanas encontradas, y formatos que quedarían sin uso
-- ============================================================================

SELECT v.id, v.anio, v."formatoExcelId", f.nombre AS formato
FROM ventana_carga v
JOIN ventanas_objetivo o ON o.id = v.id
JOIN formato_excel f ON f.id = v."formatoExcelId";

-- Si esta consulta no devuelve filas, el id no existe. Revísalo antes de continuar.

-- ============================================================================
-- 2. Guardas: no borrar ventanas con historial
-- ============================================================================

DO $$
DECLARE
  ventanas_con_cargas integer;
  ventanas_con_mensajes integer;
  ventanas_no_encontradas integer;
BEGIN
  SELECT count(*) INTO ventanas_no_encontradas
  FROM ventanas_objetivo o
  WHERE NOT EXISTS (SELECT 1 FROM ventana_carga v WHERE v.id = o.id);

  IF ventanas_no_encontradas > 0 THEN
    RAISE EXCEPTION 'Hay % ids de ventana que no existen', ventanas_no_encontradas;
  END IF;

  SELECT count(DISTINCT c."ventanaCargaId") INTO ventanas_con_cargas
  FROM carga_archivo c
  JOIN ventanas_objetivo o ON o.id = c."ventanaCargaId";

  IF ventanas_con_cargas > 0 THEN
    RAISE EXCEPTION 'Hay % ventanas con cargas de archivo; no se eliminan', ventanas_con_cargas;
  END IF;

  SELECT count(DISTINCT m."ventanaCargaId") INTO ventanas_con_mensajes
  FROM mensaje_carga m
  JOIN ventanas_objetivo o ON o.id = m."ventanaCargaId";

  IF ventanas_con_mensajes > 0 THEN
    RAISE EXCEPTION 'Hay % ventanas con mensajes de revisión; no se eliminan', ventanas_con_mensajes;
  END IF;
END $$;

-- ============================================================================
-- 3. Formatos candidatos (los de las ventanas objetivo)
-- ============================================================================

CREATE TEMP TABLE formatos_candidatos (id text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO formatos_candidatos (id)
SELECT DISTINCT v."formatoExcelId"
FROM ventana_carga v
JOIN ventanas_objetivo o ON o.id = v.id;

-- ============================================================================
-- 4. Borrar alertas y ventanas
-- ============================================================================

DELETE FROM alerta_notificacion_ventana
WHERE "ventanaCargaId" IN (SELECT id FROM ventanas_objetivo);

DELETE FROM ventana_carga
WHERE id IN (SELECT id FROM ventanas_objetivo);

-- ============================================================================
-- 5. Borrar formatos que ya no están en uso
-- ============================================================================

DELETE FROM formato_excel f
USING formatos_candidatos c
WHERE f.id = c.id
  AND NOT EXISTS (SELECT 1 FROM ventana_carga v WHERE v."formatoExcelId" = f.id)
  AND NOT EXISTS (SELECT 1 FROM carga_archivo ca WHERE ca."formatoExcelId" = f.id)
  AND NOT EXISTS (SELECT 1 FROM usuario_formato_excel uf WHERE uf."formatoExcelId" = f.id);

-- Formatos que se conservaron porque siguen en uso:
SELECT c.id, f.nombre AS formato_conservado
FROM formatos_candidatos c
JOIN formato_excel f ON f.id = c.id;

-- ============================================================================
-- 6. Verificación final
-- ============================================================================

SELECT
  (SELECT count(*) FROM ventana_carga v JOIN ventanas_objetivo o ON o.id = v.id) AS ventanas_restantes,
  (SELECT count(*) FROM formato_excel f JOIN formatos_candidatos c ON c.id = f.id) AS formatos_candidatos_restantes;

-- DESCOMENTAR PARA CONFIRMAR:
-- COMMIT;

ROLLBACK;
