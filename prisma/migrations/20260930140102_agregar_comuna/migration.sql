-- RF-28: catálogo de comunas (mantenedor bajo "Administración"). Cada comuna pertenece a una
-- provincia (FK a "provincia" con ON DELETE RESTRICT: una provincia con comunas no puede
-- eliminarse). La región se deriva de la provincia; no se guarda aquí. Es reversible con
-- `DROP TABLE "comuna";`.
--
-- Agregado a mano (Prisma no lo genera desde el schema): el CHECK de formato de `codigo` y la
-- siembra de las 12 comunas de la provincia de Concepción (081).

-- CreateTable
CREATE TABLE "comuna" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "codigo" CHAR(5) NOT NULL,
    "provinciaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comuna_pkey" PRIMARY KEY ("id"),
    -- Mismo formato que valida `comunaSchema` (5 dígitos): red de seguridad ante un INSERT manual.
    CONSTRAINT "comuna_codigo_formato" CHECK ("codigo" ~ '^[0-9]{5}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "comuna_codigo_key" ON "comuna"("codigo");

-- CreateIndex
-- Unicidad del nombre por provincia. Su primera columna indexa además la FK y el filtro por
-- provincia.
CREATE UNIQUE INDEX "comuna_provinciaId_nombreNormalizado_key" ON "comuna"("provinciaId", "nombreNormalizado");

-- AddForeignKey
ALTER TABLE "comuna" ADD CONSTRAINT "comuna_provinciaId_fkey" FOREIGN KEY ("provinciaId") REFERENCES "provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Siembra de las 12 comunas de la provincia de Concepción. `nombreNormalizado` va LITERAL,
-- calculado con `normalizarNombre()` (`src/shared/utils/texto.ts`), igual que en la siembra de
-- regiones y provincias.
--
-- La provincia se resuelve por su código ('081') con un JOIN: si la provincia 081 no existe (p. ej.
-- se eliminó o recodificó antes de esta migración), el JOIN no produce filas y la siembra NO
-- inserta nada ni falla; las comunas se pueden crear después desde el mantenedor.
-- `ON CONFLICT DO NOTHING` vuelve la siembra idempotente frente a cualquiera de las claves únicas.
INSERT INTO "comuna" ("id", "nombre", "nombreNormalizado", "codigo", "provinciaId")
SELECT gen_random_uuid()::text, v.nombre, v.normalizado, v.codigo, p."id"
FROM (
    VALUES
        ('Concepción', 'concepcion', '08101'),
        ('Coronel', 'coronel', '08102'),
        ('Chiguayante', 'chiguayante', '08103'),
        ('Florida', 'florida', '08104'),
        ('Hualqui', 'hualqui', '08105'),
        ('Lota', 'lota', '08106'),
        ('Penco', 'penco', '08107'),
        ('San Pedro de la Paz', 'san pedro de la paz', '08108'),
        ('Santa Juana', 'santa juana', '08109'),
        ('Talcahuano', 'talcahuano', '08110'),
        ('Tomé', 'tome', '08111'),
        ('Hualpén', 'hualpen', '08112')
) AS v (nombre, normalizado, codigo)
JOIN "provincia" p ON p."codigo" = '081'
ON CONFLICT DO NOTHING;
