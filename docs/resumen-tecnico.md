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
| Logs                    | Winston, JSON, a `logs/errores.txt` |
| Estado cliente          | Zustand (solo Client Components; sin stores creados aún) |
| Validación              | Zod |
| Estilos                 | Tailwind v4 (CSS-first, `@theme inline`), paleta oficial gob.cl (`gob-*`) |
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
| `modules/usuarios/`    | Stub | Casos de uso lanzan `Error("...: no implementado")` a propósito. Ver [docs/requerimientos.md](requerimientos.md#en-progreso--stub-sin-implementar). |
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
