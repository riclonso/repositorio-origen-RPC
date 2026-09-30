-- RF-27: catálogo de provincias (mantenedor bajo "Administración"). Cada provincia pertenece a una
-- región (FK a "region" con ON DELETE RESTRICT: una región con provincias no puede eliminarse).
-- Es reversible con `DROP TABLE "provincia";`.
--
-- Agregado a mano (Prisma no lo genera desde el schema): el CHECK de formato de `codigo` y la
-- siembra de las 3 provincias de la región del Biobío (08).

-- CreateTable
CREATE TABLE "provincia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "codigo" CHAR(3) NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provincia_pkey" PRIMARY KEY ("id"),
    -- Mismo formato que valida `provinciaSchema` (3 dígitos): red de seguridad ante un INSERT manual.
    CONSTRAINT "provincia_codigo_formato" CHECK ("codigo" ~ '^[0-9]{3}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "provincia_codigo_key" ON "provincia"("codigo");

-- CreateIndex
-- Unicidad del nombre por región. Su primera columna indexa además la FK y el filtro por región.
CREATE UNIQUE INDEX "provincia_regionId_nombreNormalizado_key" ON "provincia"("regionId", "nombreNormalizado");

-- AddForeignKey
ALTER TABLE "provincia" ADD CONSTRAINT "provincia_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Siembra de las 3 provincias de la región del Biobío. `nombreNormalizado` va LITERAL, calculado
-- con `normalizarNombre()` (`src/shared/utils/texto.ts`), igual que en la siembra de regiones.
--
-- La región se resuelve por su código ('08') con un JOIN: si la región 08 no existe (p. ej. se
-- eliminó o recodificó antes de esta migración), el JOIN no produce filas y la siembra NO inserta
-- nada ni falla; las provincias se pueden crear después desde el mantenedor.
-- `ON CONFLICT DO NOTHING` vuelve la siembra idempotente frente a cualquiera de las claves únicas.
INSERT INTO "provincia" ("id", "nombre", "nombreNormalizado", "codigo", "regionId")
SELECT gen_random_uuid()::text, v.nombre, v.normalizado, v.codigo, r."id"
FROM (
    VALUES
        ('Concepción', 'concepcion', '081'),
        ('Arauco', 'arauco', '082'),
        ('Biobío', 'biobio', '083')
) AS v (nombre, normalizado, codigo)
JOIN "region" r ON r."codigo" = '08'
ON CONFLICT DO NOTHING;
