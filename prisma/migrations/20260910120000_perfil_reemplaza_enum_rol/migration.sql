-- Reemplaza el enum "Rol" por la tabla catálogo "perfil". Escrita a mano: Prisma no sabe
-- convertir una columna enum en una clave foránea conservando los datos existentes.
-- Todas las sentencias son transaccionales a propósito: si una falla, la migración completa
-- se revierte y la tabla "usuario" queda intacta.

-- 1. Catálogo de perfiles.
CREATE TABLE "perfil" (
    "codigo" VARCHAR(40) NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfil_pkey" PRIMARY KEY ("codigo"),
    -- El código es un identificador estable que el código compara literalmente (ADMIN). El CHECK
    -- impide que una inserción manual como 'Admin' rompa esa comparación en silencio.
    CONSTRAINT "perfil_codigo_formato" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$'),
    -- ADMIN es el único código privilegiado del sistema. Desactivarlo dejaría al mantenedor sin
    -- poder asignar administradores nuevos mientras las sesiones vigentes siguen entrando al
    -- panel, un bloqueo a medias difícil de diagnosticar. El DELETE ya lo cubre el RESTRICT de
    -- la clave foránea; esto cierra el UPDATE.
    CONSTRAINT "perfil_admin_siempre_activo" CHECK ("codigo" <> 'ADMIN' OR "activo")
);

CREATE UNIQUE INDEX "perfil_nombre_key" ON "perfil"("nombre");

-- 2. Filas semilla. Van en la migración y no en `db:seed` porque `prisma migrate deploy` corre
-- siempre en el despliegue y el seed no: sin ellas, el SET NOT NULL y la FK de abajo no
-- tendrían a qué apuntar. `ON CONFLICT DO NOTHING` la hace idempotente.
INSERT INTO "perfil" ("codigo", "nombre", "descripcion", "orden", "activo") VALUES
    ('ADMIN', 'Administrador', NULL, 1, true),
    ('NOTIFICADOR_RPC', 'Notificador RPC', NULL, 2, true)
ON CONFLICT ("codigo") DO NOTHING;

-- 3. Columna nueva, nullable mientras se traspasan los datos.
ALTER TABLE "usuario" ADD COLUMN "perfilCodigo" VARCHAR(40);

-- 4. Traspaso: el antiguo 'USUARIO' pasa a ser 'NOTIFICADOR_RPC' (es el mismo perfil con su
-- nombre real, no un perfil distinto).
UPDATE "usuario"
SET "perfilCodigo" = CASE "rol"::text WHEN 'ADMIN' THEN 'ADMIN' ELSE 'NOTIFICADOR_RPC' END;

-- 5. Red de seguridad: si alguna fila quedó sin traspasar, la migración aborta aquí y revierte.
ALTER TABLE "usuario" ALTER COLUMN "perfilCodigo" SET NOT NULL;

-- 6. Integridad referencial. RESTRICT impide borrar un perfil que aún tiene usuarios.
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_perfilCodigo_fkey"
    FOREIGN KEY ("perfilCodigo") REFERENCES "perfil"("codigo") ON UPDATE CASCADE ON DELETE RESTRICT;

-- 7 y 8. El enum desaparece del todo: dejarlo invitaría a creer que sigue vigente.
ALTER TABLE "usuario" DROP COLUMN "rol";
DROP TYPE "Rol";
