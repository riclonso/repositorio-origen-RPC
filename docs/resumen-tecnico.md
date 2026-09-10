# Resumen técnico

Última actualización: 2026-09-04

> Este documento se actualiza automáticamente al final del flujo `/feature` cuando un requerimiento
> nuevo cambia el stack, agrega un comando de proyecto o cambia una variable de entorno.

## Stack

| Área                  | Tecnología |
|------------------------|------------|
| Framework              | Next.js 16.3.4 (App Router, convención `src/`) |
| UI                      | React 19.2.8 |
| Arquitectura backend    | Onion simplificada + modular por dominio (ver [docs/arquitectura.md](arquitectura.md)) |
| Autenticación           | jose (JWT, HS256, 8h) + bcrypt (12 rondas), vía Route Handler `POST /api/auth/login` |
| Base de datos           | PostgreSQL + Prisma ORM (`@prisma/adapter-pg`) |
| Logs                    | Winston, JSON, una instancia por archivo. `logs/errores.txt` (errores del sistema) y `logs/auditoria.txt` (operaciones sobre usuarios) implementados; `logs/accesos.txt` (login exitoso y fallido, RF-07) pendiente. `logs/` está en `.gitignore`: contienen RUT e IP. Rotación a cargo del sistema operativo |
| Estado cliente          | Zustand (solo Client Components; sin stores creados aún) |
| Validación              | Zod |
| Estilos                 | Tailwind v4 (CSS-first, `@theme inline`), paleta oficial gob.cl (`gob-*`) |
| Iconos                  | `@phosphor-icons/react`, familia única del proyecto, centralizada en `shared/components/iconos.tsx` con tamaño y peso estandarizados |
| Cookies                 | cookies-next (`httpOnly`, `secure`, `sameSite`) |
| Calidad React           | react-doctor (`npx react-doctor@latest`, ver `.agents/skills/react-doctor/`) |

Aviso de versión: Next.js 16 y React 19.2 son más recientes que el conocimiento de entrenamiento
habitual de los modelos — antes de escribir código de enrutamiento, data fetching o proxy, revisar
`node_modules/next/dist/docs/01-app/`.

## Comandos

```bash
npm run dev       # servidor de desarrollo, http://localhost:3613
npm run build     # build de producción
npm run start     # ejecuta el build de producción
npm run lint      # ESLint (flat config, eslint-config-next)
npm run db:seed   # prisma db seed -> scripts/seed-admin.ts
npx prisma migrate dev   # crea/aplica migraciones desde prisma/schema.prisma
```

No hay test runner configurado todavía en este repo.

## Variables de entorno (`.env`, no versionado)

Validadas con Zod en `src/infrastructure/config/env.ts` (falla rápido al importar si falta alguna):

| Variable              | Uso |
|------------------------|-----|
| `DATABASE_URL`         | Cadena de conexión PostgreSQL. Requerida. |
| `AUTH_SECRET`          | Secreto para firmar JWT (jose). Mínimo 32 caracteres. |
| `ADMIN_SEED_PASSWORD`  | Solo usada por `scripts/seed-admin.ts` (no pasa por `env.ts`). |

## Estado de implementación por módulo

| Módulo               | Estado | Detalle |
|------------------------|--------|---------|
| `modules/auth/`        | Implementado | Login, JWT, guard de sesión en `proxy.ts`. Ver [docs/arquitectura.md](arquitectura.md#flujo-de-referencia-autenticación). |
| `modules/perfiles/`    | Implementado | Catálogo de perfiles (RF-09). Solo lectura por ahora: los perfiles se agregan por SQL hasta que exista el mantenedor. |
| `modules/usuarios/`    | Implementado | Mantenedor de usuarios (RF-06): listar con búsqueda y paginación en servidor, crear, editar, activar/desactivar, restablecer contraseña. 4 endpoints con guard propio. Ver [docs/arquitectura.md](arquitectura.md#decisiones-de-diseño-de-rf-06-mantenedor-de-usuarios). |
| Reporte Excel/CSV      | No iniciado | Objetivo central del sistema, aún sin especificar. Ver [docs/requerimientos.md](requerimientos.md#objetivo-del-sistema). |

## Herramientas de calidad y agentes

* **Agentes de desarrollo:** `.claude/agents/architecto.md`, `.claude/agents/desarrollador.md`,
  `.claude/agents/revisor.md` — subagentes nativos de Claude Code con acceso a herramientas
  restringido según su rol (el `architecto` y el `revisor` no pueden escribir ni editar código).
  Orquestados por el comando `/feature` (`.claude/commands/feature.md`).
* **react-doctor:** audita componentes React (lint, accesibilidad, bundle, arquitectura). Instalado
  vía skill (`skills-lock.json`, `.agents/skills/react-doctor/`), se ejecuta con `npx` (no es
  devDependency). El agente `desarrollador` lo corre antes y después de implementar cambios en React.
* **Verificación previa a aprobar código:** `npx tsc --noEmit`, `npm run lint`, `npm run build` —
  obligatorias para el agente `revisor` antes de emitir veredicto.


## Notas de despliegue

* **Migración `20260909120000_habilitar_unaccent`.** Ejecuta `CREATE EXTENSION IF NOT EXISTS unaccent`
  para que la búsqueda de usuarios ignore tildes. El rol de base de datos debe tener permiso para crear
  la extensión: es *trusted* desde PostgreSQL 13, pero varios PostgreSQL gestionados lo restringen, y
  sin ese permiso `prisma migrate deploy` falla.
* **`ADMIN_SEED_PASSWORD` ahora se valida.** Desde RF-06, `scripts/seed-admin.ts` exige el mismo mínimo
  que el mantenedor: 8 caracteres o más, con al menos una minúscula, una mayúscula y un dígito. Una
  contraseña que no cumpla hace fallar `npm run db:seed` con un mensaje explícito. El login **no**
  valida complejidad (`login.schema.ts` conserva `min(1)`), así que las contraseñas anteriores siguen
  sirviendo para iniciar sesión.
* **`npm run postinstall` genera el cliente de Prisma.** `@prisma/client` no exporta nada hasta que
  se ejecuta `prisma generate`, así que sin este script el servidor de build compila y luego falla el
  type check con `Module '@prisma/client' has no exported member 'PrismaClient'`. Localmente el error
  no aparece si alguien ya corrió `prisma generate` a mano.
* **`prisma.config.ts` no exige `.env` ni `DATABASE_URL`.** `process.loadEnvFile()` va en `try/catch`
  (en el servidor ese archivo no existe) y la `datasource` solo se define si `DATABASE_URL` está
  presente, porque `prisma generate` no se conecta a la base de datos y con `env("DATABASE_URL")`
  abortaba con `PrismaConfigEnvError`. Los comandos que sí necesitan la URL la reciben cuando existe.
* **`DATABASE_URL` y `AUTH_SECRET` deben estar disponibles en TIEMPO DE BUILD**, no solo en runtime.
  `next build` evalúa los Route Handlers para recolectar su configuración, esos importan
  `infrastructure/config/env.ts`, y ese módulo valida con Zod al importarse. Si faltan, el build
  termina en `Failed to collect page data` con un `ZodError`. En Coolify hay que marcarlas como
  disponibles durante el build, no solo como variables de ejecución.
* **RF-09 exige `pg_dump` antes de desplegar.** La migración `20260910120000_perfil_reemplaza_enum_rol`
  borra `usuario.rol` y el tipo `Rol`: es irreversible in place. Respaldar con
  `pg_dump "$DATABASE_URL" --table=usuario --data-only --column-inserts > respaldo.sql` antes de
  aplicarla.
* **RF-09 invalida todas las sesiones vigentes.** El claim del JWT pasó de `rol` a `perfil`, así que
  quien esté conectado al desplegar será redirigido a `/login` y deberá volver a entrar.
* **No puede haber despliegue rolling en RF-09.** Tras el `DROP COLUMN "rol"`, cualquier instancia con
  el código anterior falla al consultar `usuario`. Con el contenedor único de Coolify la ventana es el
  swap; si eso no fuera aceptable, detener el contenedor viejo antes de `prisma migrate deploy`.

