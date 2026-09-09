# Arquitectura

Última actualización: 2026-09-04

> Este documento se actualiza automáticamente al final del flujo `/feature` cuando un requerimiento
> nuevo introduce un módulo, capa o patrón que no estaba documentado aquí. La fuente operativa para
> agentes IA sigue siendo `CLAUDE.md`; este archivo es la referencia de diseño más detallada.

## Patrón general

**Onion Architecture simplificada + modular por dominio.**

Cada feature de negocio es un módulo autocontenido en `src/modules/<módulo>/` con sus propias capas
`domain → application → infrastructure`. Solo lo verdaderamente transversal (conexión a BD, config
de entorno, logging) vive en `src/infrastructure/` a nivel raíz.

```
src/
├── app/                    — App Router: páginas, layouts, Route Handlers (app/api/**/route.ts)
├── modules/
│   ├── auth/
│   │   ├── domain/         — entities/User.ts, repositories/UserRepository.ts (interfaz)
│   │   ├── application/    — ports.ts (interfaces técnicas), use-cases/LoginUser.ts
│   │   ├── infrastructure/ — repositories/PrismaUserRepository.ts, auth/PasswordService.ts, auth/JwtService.ts
│   │   └── schemas/        — login.schema.ts (Zod)
│   └── usuarios/           — mismo patrón; CRUD de administración de usuarios (stub, ver docs/requerimientos.md)
├── infrastructure/         — database/prisma.ts, config/env.ts, logging/logger.ts (transversal, no de un módulo)
├── proxy.ts                — guard de sesión para rutas protegidas (reemplaza a middleware.ts en Next.js 16)
└── shared/
    └── utils/               — rut.ts (validación de RUT, usada por varios módulos)
```

`prisma/`, `scripts/`, `public/` y los archivos de configuración quedan en la raíz del proyecto,
fuera de `src/` (convención `src` de Next.js). El alias `@/*` apunta a `src/*`.

## Flujo de dependencias

Dentro de cada módulo, la dependencia va de afuera hacia adentro:

* `app/*` (páginas o Route Handlers) invoca casos de uso de
  `modules/<módulo>/application/use-cases/`, pasándoles implementaciones de
  `modules/<módulo>/infrastructure/` como dependencias inyectadas.
* `application/` solo conoce las interfaces de `domain/repositories/` y `application/ports.ts`,
  nunca Prisma/bcrypt/jose directamente.

Al agregar un módulo nuevo: replicar esta estructura de carpetas en vez de llamar a Prisma u otra
librería de infraestructura directamente desde `app/`.

## Flujo de referencia: autenticación

Ejemplo completo de cómo encajan las capas (login es un Route Handler REST, no un Server Action):

1. `modules/auth/domain/entities/User.ts` — tipo `User`, `Rol` (`"ADMIN" | "USUARIO"`), regla
   `puedeIniciarSesion`.
2. `modules/auth/domain/repositories/UserRepository.ts` — interfaz `UserRepository`
   (`buscarPorRut`). `modules/auth/application/ports.ts` — interfaces técnicas
   `VerificadorContrasena`, `EmisorSesion`.
3. `modules/auth/application/use-cases/LoginUser.ts` — caso de uso `loginUser(rut, contrasena,
   dependencias)`; siempre ejecuta `verificar()` contra un hash de relleno (`HASH_RELLENO`) cuando
   el RUT no existe, para que el tiempo de respuesta no permita enumerar RUTs válidos.
4. `modules/auth/infrastructure/repositories/PrismaUserRepository.ts`,
   `infrastructure/auth/PasswordService.ts` (bcrypt, 12 rondas),
   `infrastructure/auth/JwtService.ts` (jose, HS256, expiración 8h, expone `verificarSesion()`).
5. `app/api/auth/login/route.ts` (`POST`) — valida el body con
   `modules/auth/schemas/login.schema.ts` (Zod + `shared/utils/rut.ts`), llama a `loginUser`
   inyectando las implementaciones de infraestructura, guarda el JWT en la cookie httpOnly `sesion`
   vía `cookies-next/server`.
6. `app/login/login-form.tsx` — Client Component; `useActionState` con función cliente que hace el
   `fetch` de arriba (no Server Action).
7. `src/proxy.ts` — protege `/dashboard/:path*`: lee la cookie `sesion`, la verifica con
   `verificarSesion()` y exige `rol === "ADMIN"`; si no, redirige a `/login`.
8. `app/dashboard/actions.ts` (`cerrarSesionAction`, Server Action) — borra la cookie y redirige.

## Decisiones de diseño ya tomadas

* **Route Handlers vs Server Actions:** Route Handlers para endpoints con lógica de negocio (auth,
  CRUDs); Server Actions solo para mutaciones triviales sin caso de uso propio (cerrar sesión).
* **Proxy, no Middleware:** Next.js 16 renombró Middleware a Proxy. El archivo debe llamarse
  `src/proxy.ts` y exportar `proxy` — `middleware.ts` se ignora silenciosamente sin error.
* **Zustand solo en cliente:** ningún store a nivel de módulo puede ser leído o mutado desde código
  que corre en el servidor (riesgo de fuga de estado entre usuarios). Aún no hay ningún store creado.
* **Nomenclatura mixta intencional:** `modules/auth/` usa nombres de clases/entidades en inglés
  (decisión explícita al crearlo); `modules/usuarios/` y módulos nuevos van en español. No trasladar
  la convención de `auth/` a módulos nuevos sin que se pida explícitamente.
* **Validación compartida:** esquemas Zod en `modules/<módulo>/schemas/`, reutilizados entre
  frontend y backend en vez de duplicar reglas.

## Base de datos

* PostgreSQL vía `@prisma/adapter-pg` (`src/infrastructure/database/prisma.ts` reutiliza el
  `PrismaClient` en `globalThis` para evitar múltiples conexiones en dev).
* `prisma/schema.prisma` define por ahora solo el modelo `Usuario`, mapeado a la tabla `usuario`.

## Agentes de desarrollo

Ver [.claude/agents/](../.claude/agents/) (`architecto`, `desarrollador`, `revisor`) y el comando
[/feature](../.claude/commands/feature.md) que los orquesta. El skill `react-doctor`
(`.agents/skills/react-doctor/`) audita componentes React durante la fase de implementación.
