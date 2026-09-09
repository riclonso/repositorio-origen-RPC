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
│   └── usuarios/           — mismo patrón; mantenedor de usuarios (RF-06, implementado)
├── infrastructure/         — database/prisma.ts, config/env.ts, logging/{logger,auditoria}.ts (transversal)
├── proxy.ts                — guard de sesión para rutas protegidas (reemplaza a middleware.ts en Next.js 16)
└── shared/
    ├── components/          — CampoTexto, CampoContrasena, CampoSelect, Boton, DialogoConfirmacion
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


## Decisiones de diseño de RF-06 (mantenedor de usuarios)

Registradas aquí porque condicionan cómo se construyen los módulos siguientes.

### El guard de API vive en el Route Handler, no en el proxy

`src/proxy.ts` protege páginas con `matcher: "/dashboard/:path*"` y **no cubre `/api/**`**. Se decidió
no ampliar el matcher y poner el guard dentro de cada handler (`exigirAdmin()` en
`app/api/usuarios/_lib/http.ts`). Tres razones: el proxy responde con `NextResponse.redirect` a
`/login`, y un `fetch` del cliente seguiría el redirect y recibiría HTML donde espera JSON; los casos de
uso necesitan el `id` del actor para las reglas anti-autobloqueo, dato que el handler debe obtener de
todas formas; y el proxy corre en runtime Edge, donde multiplicar responsabilidades aumenta la
superficie de fallo.

**Consecuencia para módulos nuevos:** todo Route Handler bajo `/api/` que exponga datos o mutaciones
debe traer su propio guard. No se puede asumir que el proxy lo cubre.

### El logging de auditoría se invoca desde el borde, no desde `application/`

Ver la sección Logging de `CLAUDE.md`. La alternativa era un puerto `RegistradorAuditoria` inyectado en
los cinco casos de uso; se descartó porque el evento incluye IP y user agent, que `application/` no debe
conocer, y porque hay precedente sancionado (el logging de errores ya se invoca desde los Route
Handlers).

### Búsqueda insensible a tildes: `unaccent` y SQL crudo

La migración `20260909120000_habilitar_unaccent` ejecuta `CREATE EXTENSION IF NOT EXISTS unaccent`.
Prisma Client no expone `unaccent()`, así que el listado de usuarios es la única consulta del proyecto
que usa `prisma.$queryRaw`. El término va parametrizado por la plantilla etiquetada de Prisma y los
comodines LIKE se escapan. El SELECT y el COUNT comparten literalmente el mismo predicado y van en el
mismo `$transaction`, para que las filas y el total vean el mismo snapshot.

**Requisito de despliegue:** el rol de base de datos debe poder crear la extensión. `unaccent` es
*trusted* desde PostgreSQL 13, pero varios PostgreSQL gestionados lo restringen; sin ese permiso
`prisma migrate deploy` falla.

### Sin índices para el listado, con umbral documentado

No se agregó ningún índice. La búsqueda genera `ILIKE '%token%'` y el comodín inicial inhabilita
cualquier índice btree, así que agregarlo encarecería los INSERT sin acelerar nada. **Umbral para
revisitar la decisión:** si la tabla `usuario` supera unas 50.000 filas o el listado supera 300 ms en el
servidor, evaluar `pg_trgm` + índice GIN sobre una columna normalizada.

### Contraste: el token `gob-danger`

La paleta oficial de gob.cl no trae un rojo que pase WCAG AA como texto sobre blanco
(`gob-secondary` #fe6565 queda en ~3.0:1). Se agregó `--color-gob-danger` (#a01f1f, ~7.7:1) para texto
de error y acciones destructivas. `gob-gray-b` (#8a8a8a, ~3.1:1) es solo para bordes y placeholders:
etiquetas y texto de ayuda usan `gob-gray-a` (#4a4a4a, ~7.4:1).
