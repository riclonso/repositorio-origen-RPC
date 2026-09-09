import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

process.loadEnvFile();

const DATOS_ADMIN = {
  nombres: "Ricardo",
  apellidos: "Sanhueza Aguayo",
  rut: "14212602-8",
  email: "ricardo.sanhueza@redsalud.gob.cl",
  username: "rsanhueza",
};

async function main() {
  const contrasena = process.env.ADMIN_SEED_PASSWORD;
  if (!contrasena) {
    throw new Error("Falta ADMIN_SEED_PASSWORD en .env");
  }

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
