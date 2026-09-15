-- Alta de usuarios sin contraseña (activación por enlace de un solo uso).
--
-- Migración puramente ADITIVA y NO destructiva: no borra datos ni columnas y admite despliegue
-- rolling. Los usuarios existentes ya tienen `contrasenaHash` no nulo, así que al relajar la
-- restricción NOT NULL su estado no cambia (siguen "con contraseña"). El código anterior a esta
-- entrega ignora la columna `origen`, que llega con DEFAULT.
--
-- Reversible con:
--   ALTER TABLE "token_recuperacion" DROP COLUMN "origen";
--   -- (solo tras garantizar que no queden filas con contrasenaHash NULL)
--   ALTER TABLE "usuario" ALTER COLUMN "contrasenaHash" SET NOT NULL;

-- `contrasenaHash` pasa a ser NULLABLE. NULL identifica una cuenta pendiente de activación: se
-- creó sin contraseña y no puede iniciar sesión hasta fijarla mediante el enlace enviado al
-- correo. Es la autoridad única del estado "pendiente" (sin flag paralelo).
ALTER TABLE "usuario" ALTER COLUMN "contrasenaHash" DROP NOT NULL;

-- Origen de la emisión del token: AUTOSERVICIO (formulario público) o ADMIN (mantenedor). El
-- cupo por cuenta solo acota AUTOSERVICIO. El DEFAULT deja intactas las filas ya existentes.
ALTER TABLE "token_recuperacion" ADD COLUMN "origen" VARCHAR(20) NOT NULL DEFAULT 'AUTOSERVICIO';

-- Red de seguridad ante un INSERT manual o un bug: solo se admiten los dos orígenes conocidos.
ALTER TABLE "token_recuperacion"
    ADD CONSTRAINT "token_recuperacion_origen_valido"
    CHECK ("origen" IN ('AUTOSERVICIO', 'ADMIN'));
