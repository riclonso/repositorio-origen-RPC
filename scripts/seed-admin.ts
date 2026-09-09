import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

process.loadEnvFile();

// El username siempre es el RUT de la persona (regla de negocio, ver CLAUDE.md).
const RUT_ADMIN = "14212602-8";

const DATOS_ADMIN = {
  nombres: "Ricardo",
  apellidos: "Sanhueza Aguayo",
  rut: RUT_ADMIN,
  email: "ricardo.sanhueza@redsalud.gob.cl",
  username: RUT_ADMIN,
};

// Validación de complejidad DUPLICADA a propósito: este script no importa nada de `src/`
// para no depender del árbol de la aplicación. La fuente de verdad de la política es
// `contrasenaSchema` en src/modules/usuarios/schemas/usuario.schema.ts: si cambia allá,
// hay que cambiarla aquí también.
const LARGO_MINIMO_CONTRASENA = 8;
const MAXIMO_BYTES_CONTRASENA = 72;

function validarContrasenaSemilla(contrasena: string): void {
  const cumpleComplejidad =
    contrasena.length >= LARGO_MINIMO_CONTRASENA &&
    /[a-z]/.test(contrasena) &&
    /[A-Z]/.test(contrasena) &&
    /\d/.test(contrasena);

  if (!cumpleComplejidad) {
    throw new Error(
      "ADMIN_SEED_PASSWORD debe tener al menos 8 caracteres e incluir una mayúscula, una minúscula y un número.",
    );
  }

  if (new TextEncoder().encode(contrasena).length > MAXIMO_BYTES_CONTRASENA) {
    throw new Error("ADMIN_SEED_PASSWORD es demasiado larga: bcrypt trunca en 72 bytes UTF-8.");
  }
}

async function main() {
  const contrasena = process.env.ADMIN_SEED_PASSWORD;
  if (!contrasena) {
    throw new Error("Falta ADMIN_SEED_PASSWORD en .env");
  }

  validarContrasenaSemilla(contrasena);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Falta DATABASE_URL en .env");
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const contrasenaHash = await bcrypt.hash(contrasena, 12);

  const usuario = await prisma.usuario.upsert({
    where: { rut: DATOS_ADMIN.rut },
    update: {
      nombres: DATOS_ADMIN.nombres,
      apellidos: DATOS_ADMIN.apellidos,
      email: DATOS_ADMIN.email,
      username: DATOS_ADMIN.username,
      contrasenaHash,
      rol: "ADMIN",
      activo: true,
    },
    create: {
      ...DATOS_ADMIN,
      contrasenaHash,
      rol: "ADMIN",
      activo: true,
    },
  });

  console.log(`Usuario admin sembrado: ${usuario.username} (${usuario.rut})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
