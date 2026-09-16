-- Mantenedores de tipos de establecimiento y establecimientos.
--
-- Migración puramente ADITIVA: crea dos tablas nuevas y no toca ninguna tabla ni columna
-- existente. Es reversible con `DROP TABLE "establecimiento"; DROP TABLE "tipo_establecimiento";`
-- (en ese orden, por la clave foránea). No requiere extensiones ni permisos especiales, así que
-- admite despliegue rolling: el código anterior ignora las tablas nuevas.

-- 1. Catálogo de tipos de establecimiento. `nombreNormalizado` es la clave de unicidad derivada
-- de `nombre` (sin tildes, minúsculas, espacios colapsados), calculada en la aplicación.
CREATE TABLE "tipo_establecimiento" (
    "id"                TEXT NOT NULL,
    "nombre"            TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "activo"            BOOLEAN NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_establecimiento_pkey" PRIMARY KEY ("id")
);

-- UNIQUE, no solo índice: garantiza que dos tipos no puedan reclamar el mismo nombre normalizado
-- aunque difieran en tildes o mayúsculas, además de cerrar la ventana de carrera del chequeo
-- previo en la aplicación (violación P2002 -> TipoEstablecimientoDuplicadoError).
CREATE UNIQUE INDEX "tipo_establecimiento_nombreNormalizado_key"
    ON "tipo_establecimiento"("nombreNormalizado");

-- 2. Establecimientos. El RUT normalizado es el único identificador único: el nombre puede
-- repetirse entre establecimientos.
CREATE TABLE "establecimiento" (
    "id"        TEXT NOT NULL,
    "rut"       TEXT NOT NULL,
    "nombre"    TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "tipoId"    TEXT NOT NULL,
    "activo"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "establecimiento_pkey" PRIMARY KEY ("id")
);

-- UNIQUE sobre el RUT: mismo criterio de integridad y cierre de carrera que arriba.
CREATE UNIQUE INDEX "establecimiento_rut_key" ON "establecimiento"("rut");

-- 3. Integridad referencial. RESTRICT impide borrar un tipo que aún tiene establecimientos; la
-- baja de un tipo se hace con `activo = false`, no con DELETE.
ALTER TABLE "establecimiento"
    ADD CONSTRAINT "establecimiento_tipoId_fkey"
    FOREIGN KEY ("tipoId") REFERENCES "tipo_establecimiento"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;
