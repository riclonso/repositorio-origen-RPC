-- Siembra de las comunas de las provincias de Arauco (082) y Biobío (083), completando la región
-- del Biobío junto con las de Concepción (081, sembradas en `20260930140102_agregar_comuna`).
-- Solo datos: no cambia el esquema.
--
-- Mismo criterio que esa siembra: `nombreNormalizado` va LITERAL, calculado con
-- `normalizarNombre()` (`src/shared/utils/texto.ts`); la provincia se resuelve por su código con
-- un JOIN, así que si una provincia no existe sus comunas no se insertan y la migración no falla;
-- `ON CONFLICT DO NOTHING` la vuelve idempotente frente a cualquiera de las claves únicas.
INSERT INTO "comuna" ("id", "nombre", "nombreNormalizado", "codigo", "provinciaId")
SELECT gen_random_uuid()::text, v.nombre, v.normalizado, v.codigo, p."id"
FROM (
    VALUES
        -- Provincia de Arauco (082)
        ('Lebu', 'lebu', '08201', '082'),
        ('Arauco', 'arauco', '08202', '082'),
        ('Cañete', 'canete', '08203', '082'),
        ('Contulmo', 'contulmo', '08204', '082'),
        ('Curanilahue', 'curanilahue', '08205', '082'),
        ('Los Álamos', 'los alamos', '08206', '082'),
        ('Tirúa', 'tirua', '08207', '082'),
        -- Provincia de Biobío (083)
        ('Los Ángeles', 'los angeles', '08301', '083'),
        ('Antuco', 'antuco', '08302', '083'),
        ('Cabrero', 'cabrero', '08303', '083'),
        ('Laja', 'laja', '08304', '083'),
        ('Mulchén', 'mulchen', '08305', '083'),
        ('Nacimiento', 'nacimiento', '08306', '083'),
        ('Negrete', 'negrete', '08307', '083'),
        ('Quilaco', 'quilaco', '08308', '083'),
        ('Quilleco', 'quilleco', '08309', '083'),
        ('San Rosendo', 'san rosendo', '08310', '083'),
        ('Santa Bárbara', 'santa barbara', '08311', '083'),
        ('Tucapel', 'tucapel', '08312', '083'),
        ('Yumbel', 'yumbel', '08313', '083'),
        ('Alto Biobío', 'alto biobio', '08314', '083')
) AS v (nombre, normalizado, codigo, codigo_provincia)
JOIN "provincia" p ON p."codigo" = v.codigo_provincia
ON CONFLICT DO NOTHING;
