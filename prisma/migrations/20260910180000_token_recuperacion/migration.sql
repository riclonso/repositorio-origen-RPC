-- Tokens de recuperación de contraseña (RF-10).
--
-- Migración puramente ADITIVA: no toca ninguna tabla ni columna existente y es reversible con
-- `DROP TABLE "token_recuperacion";`. No requiere extensiones ni permisos especiales (a
-- diferencia de `unaccent`), así que admite despliegue rolling: el código anterior ignora la
-- tabla nueva.
--
-- Los dos CHECK se agregaron a mano: Prisma no los genera desde el schema.

CREATE TABLE "token_recuperacion" (
    "id"           TEXT NOT NULL,
    "usuarioId"    TEXT NOT NULL,
    -- SHA-256 en hexadecimal del token. El token EN CLARO no se persiste en ninguna parte:
    -- existe solo en memoria durante la petición que lo emite y dentro del correo enviado.
    "tokenHash"    VARCHAR(64) NOT NULL,
    -- Las cuatro fechas guardan el reloj de pared en UTC en un TIMESTAMP sin zona, la misma
    -- convención que `usuario` y `perfil`. Se midió la variante CON zona, que es lo que
    -- conceptualmente corresponde a un instante absoluto, y NO es utilizable con este stack:
    -- Prisma sobre @prisma/adapter-pg serializa un Date como `2026-09-10 15:12:25.451` (UTC sin
    -- marca de zona), así que PostgreSQL lo interpreta con el TimeZone de la sesión y guarda un
    -- instante corrido. Ver el comentario extenso en prisma/schema.prisma.
    --
    -- REGLA que sostiene la convención, obligatoria en cualquier consulta futura sobre esta
    -- tabla: nunca comparar estas columnas contra now() ni castearlas a la variante con zona; el
    -- instante siempre viaja como parámetro casteado a TIMESTAMP, igual que lo escribe Prisma.
    "expiraEn"     TIMESTAMP(3) NOT NULL,
    -- Dos timestamps y no un enum de estado: distinguen dos hechos distintos para el soporte
    -- ("lo usó su titular" vs "lo mató un cambio de contraseña por otra vía") y ambos son
    -- fechas útiles, no solo banderas.
    "usadoEn"      TIMESTAMP(3),
    "invalidadoEn" TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_recuperacion_pkey" PRIMARY KEY ("id"),
    -- Red de seguridad ante un INSERT manual o un bug que intente guardar el token en claro:
    -- solo entra un digest hexadecimal de 64 caracteres.
    CONSTRAINT "token_recuperacion_hash_formato" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "token_recuperacion_vencimiento" CHECK ("expiraEn" > "createdAt")
);

-- UNIQUE, no solo índice: es una garantía de integridad (dos filas jamás pueden reclamar el
-- mismo secreto) además del camino de lectura del consumo.
CREATE UNIQUE INDEX "token_recuperacion_tokenHash_key" ON "token_recuperacion"("tokenHash");

-- Sin índice sobre "usuarioId", por la misma razón ya documentada para el listado de usuarios
-- y para "usuario"."perfilCodigo": con una tabla de decenas de filas vivas (la purga la
-- mantiene diminuta) el seq scan gana y el índice solo encarece los INSERT.
ALTER TABLE "token_recuperacion"
    ADD CONSTRAINT "token_recuperacion_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;
