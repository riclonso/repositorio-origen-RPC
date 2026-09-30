-- RF-26: catálogo de regiones (mantenedor bajo "Administración"). Tabla nueva, sin relaciones con
-- tablas existentes. Es reversible con `DROP TABLE "region";`.
--
-- Agregado a mano (Prisma no lo genera desde el schema): el CHECK de rango de `numero` y la
-- siembra de las 16 regiones oficiales de Chile.

-- CreateTable
CREATE TABLE "region" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "codigo" CHAR(2) NOT NULL,
    "numero" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id"),
    -- Mismo rango que valida `regionSchema` (1..99): red de seguridad ante un INSERT manual.
    CONSTRAINT "region_numero_rango" CHECK ("numero" BETWEEN 1 AND 99)
);

-- CreateIndex
CREATE UNIQUE INDEX "region_nombreNormalizado_key" ON "region"("nombreNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "region_codigo_key" ON "region"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "region_numero_key" ON "region"("numero");

-- Siembra de las 16 regiones oficiales. `nombreNormalizado` va LITERAL, calculado con
-- `normalizarNombre()` (`src/shared/utils/texto.ts`: NFD, sin diacríticos, trim, espacios
-- colapsados, minúsculas); no se deriva en SQL para no depender de `unaccent()` ni de que su
-- resultado coincida con el de la aplicación. `ON CONFLICT DO NOTHING` vuelve la siembra
-- idempotente frente a cualquiera de las tres claves únicas.
INSERT INTO "region" ("id", "nombre", "nombreNormalizado", "codigo", "numero")
VALUES
    (gen_random_uuid()::text, 'Tarapacá', 'tarapaca', '01', 1),
    (gen_random_uuid()::text, 'Antofagasta', 'antofagasta', '02', 2),
    (gen_random_uuid()::text, 'Atacama', 'atacama', '03', 3),
    (gen_random_uuid()::text, 'Coquimbo', 'coquimbo', '04', 4),
    (gen_random_uuid()::text, 'Valparaíso', 'valparaiso', '05', 5),
    (gen_random_uuid()::text, 'Libertador General Bernardo O''Higgins', 'libertador general bernardo o''higgins', '06', 6),
    (gen_random_uuid()::text, 'Maule', 'maule', '07', 7),
    (gen_random_uuid()::text, 'Biobío', 'biobio', '08', 8),
    (gen_random_uuid()::text, 'La Araucanía', 'la araucania', '09', 9),
    (gen_random_uuid()::text, 'Los Lagos', 'los lagos', '10', 10),
    (gen_random_uuid()::text, 'Aysén del General Carlos Ibáñez del Campo', 'aysen del general carlos ibanez del campo', '11', 11),
    (gen_random_uuid()::text, 'Magallanes y de la Antártica Chilena', 'magallanes y de la antartica chilena', '12', 12),
    (gen_random_uuid()::text, 'Metropolitana de Santiago', 'metropolitana de santiago', '13', 13),
    (gen_random_uuid()::text, 'Los Ríos', 'los rios', '14', 14),
    (gen_random_uuid()::text, 'Arica y Parinacota', 'arica y parinacota', '15', 15),
    (gen_random_uuid()::text, 'Ñuble', 'nuble', '16', 16)
ON CONFLICT DO NOTHING;
