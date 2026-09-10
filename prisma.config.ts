import { defineConfig } from "prisma/config";

// En local las variables vienen de .env; en el servidor de build y en producción llegan ya
// puestas en el entorno y ese archivo no existe. Sin este try/catch, `prisma generate` aborta
// con ENOENT antes de leer el schema y el build falla entero.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables de entorno tal como estén.
}

// `prisma generate` no se conecta a la base de datos, solo lee el schema, así que no puede exigir
// DATABASE_URL: en el servidor de build esa variable no está definida y con `env("DATABASE_URL")`
// la generación fallaba con PrismaConfigEnvError, dejando a @prisma/client sin exportar nada y
// rompiendo el type check. Los comandos que sí necesitan la URL (migrate, db seed) la reciben
// cuando está presente, y fallan con su propio mensaje si falta.
const urlBaseDatos = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  ...(urlBaseDatos ? { datasource: { url: urlBaseDatos } } : {}),
  migrations: {
    seed: "tsx scripts/seed-admin.ts",
  },
});
