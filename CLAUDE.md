# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Este archivo proporciona guía a Claude Code (claude.ai/code) al trabajar con código en este repositorio.

@AGENTS.md

## Contexto

Sistema que usan laboratorios y/o unidades de entidades de salud, para reportar datos de Registro Poblacional de Cancer en formato excel o csv. 

## Documentación viva (`docs/`)

Este proyecto mantiene tres documentos que reflejan el estado *actual* del sistema (no solo cómo
trabajar en él, que es lo que cubre este archivo):

- `docs/requerimientos.md` — qué hace el sistema, requerimiento por requerimiento, con su estado
  (implementado / stub / pendiente de definir).
- `docs/arquitectura.md` — referencia de diseño detallada (estructura de carpetas, flujo de
  dependencias, decisiones ya tomadas).
- `docs/resumen-tecnico.md` — stack, comandos, variables de entorno, estado de implementación por
  módulo.

**Regla del proyecto:** cualquier cambio real al código (nuevo requerimiento, módulo, dependencia,
comando, variable de entorno o decisión de arquitectura) debe reflejarse en el documento
correspondiente de `docs/` como parte del mismo trabajo, no como tarea aparte pendiente. El flujo
`/feature` (ver más abajo) lo hace automáticamente en su Fase 4; si el cambio se hace fuera de ese
flujo, actualízalos tú mismo antes de dar el trabajo por terminado.

## Agentes de desarrollo

El proyecto define tres subagentes de Claude Code en `.claude/agents/`: `architecto` (solo lectura,
diseña sin escribir código), `desarrollador` (implementa lo aprobado, corre react-doctor) y
`revisor` (solo lectura + verificaciones, audita sin poder modificar código). El comando
`/feature <requerimiento>` (`.claude/commands/feature.md`) los orquesta en orden — úsalo antes de
implementar cualquier requerimiento nuevo en vez de escribir código directamente.

## Aviso de versión

Este proyecto usa **Next.js 16.3.4** con **React 19.2.8** — una versión más reciente de lo que refleja
la mayoría de los datos de entrenamiento. Las convenciones, APIs y estructura de archivos pueden diferir
de lo esperado. Antes de escribir código de enrutamiento, configuración, obtención de datos o
proxy/middleware, revisa la documentación incluida en `node_modules/next/dist/docs/01-app/` en lugar de
confiar en la memoria.

Cambio importante ya relevante aquí: **Middleware ahora se llama Proxy.** El interceptor de peticiones
a nivel raíz es `proxy.ts` (exporta `proxy`), no `middleware.ts`. Ver
`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.

## Comandos

- `npm run dev` — inicia el servidor de desarrollo (http://localhost:3613; el puerto se fija en el
  script, no es el 3000 por defecto)
- `npm run build` — build de producción
- `npm run start` — ejecuta el build de producción
- `npm run lint` — ESLint (configuración flat vía `eslint.config.mjs`, usando `eslint-config-next`)
- `npm run db:seed` — corre `prisma db seed`, que ejecuta `scripts/seed-admin.ts` (ver más abajo)
- `npx prisma migrate dev` — crea/aplica migraciones a partir de `prisma/schema.prisma`
  (config en `prisma.config.ts`, no en `package.json#prisma`)

Todavía no hay un test runner configurado en este repo.

### Variables de entorno (`.env`, no versionado)

`src/infrastructure/config/env.ts` valida con Zod al importarse — si falta una, la app falla rápido
en vez de fallar en runtime más adelante:

- `DATABASE_URL` — cadena de conexión PostgreSQL, requerida.
- `AUTH_SECRET` — secreto para firmar JWT con `jose`, mínimo 32 caracteres.
- `ADMIN_SEED_PASSWORD` — solo la usa `scripts/seed-admin.ts` (no pasa por `env.ts`), para
  sembrar/actualizar el usuario administrador inicial.

## Arquitectura

Todo el código de aplicación vive bajo `src/` (convención `src` de Next.js — ver
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/src-folder.md`). El alias
`@/*` apunta a `src/*` (`tsconfig.json`). `prisma/`, `scripts/`, `public/` y los archivos de config
quedan en la raíz del proyecto, fuera de `src/`, como exige esa convención.

Patrón: **Onion Architecture simplificada + modular por dominio.** Cada feature de negocio es un
módulo autocontenido en `src/modules/<módulo>/` con sus propias capas domain → application →
infrastructure; solo lo verdaderamente transversal (conexión a BD, config de entorno, logging) vive
en `src/infrastructure/` a nivel raíz.

```
src/
├── app/                    — App Router: páginas, layouts, Route Handlers (app/api/**/route.ts)
├── modules/
│   ├── auth/
│   │   ├── domain/         — entities/User.ts, repositories/UserRepository.ts (interfaz)
│   │   ├── application/    — ports.ts (interfaces técnicas), use-cases/LoginUser.ts
│   │   ├── infrastructure/ — repositories/PrismaUserRepository.ts, auth/PasswordService.ts, auth/JwtService.ts
│   │   └── schemas/        — login.schema.ts (Zod)
│   └── usuarios/           — mismo patrón; CRUD de administración de usuarios (aún no implementado)
├── infrastructure/         — database/prisma.ts, config/env.ts, logging/logger.ts (transversal, no de un módulo)
└── shared/
    └── utils/               — rut.ts (validación de RUT, usada por varios módulos)
```

El flujo de dependencia es de afuera hacia adentro **dentro de cada módulo**: `app/*` (páginas o Route
Handlers) invoca casos de uso de `modules/<módulo>/application/use-cases/`, pasándoles implementaciones
de `modules/<módulo>/infrastructure/` como dependencias inyectadas; `application/` solo conoce las
interfaces de `domain/repositories/` y `application/ports.ts`, nunca Prisma/bcrypt/jose directamente.
Al agregar un módulo nuevo, replicar esta misma estructura de carpetas en vez de llamar a Prisma u otra
librería de infraestructura directamente desde `app/`.

**Nota de convención de nombres:** dentro de `modules/auth/` las entidades y clases usan nombres en
inglés (`User`, `UserRepository`, `LoginUser`, `JwtService`) porque así se decidió explícitamente al
crear el módulo; dentro de `modules/usuarios/` van en español (`Usuario`, `UsuarioRepository`,
`CrearUsuario`, `ObtenerUsuario`). En ambos casos los nombres de variables, parámetros y métodos
siguen la regla general del proyecto (camelCase en español, ver más abajo). No trasladar la
convención en inglés de `auth/` a módulos nuevos sin que se pida explícitamente.

### `modules/usuarios/` (mantenedor de usuarios, RF-06)

Módulo implementado. Cubre listar (con búsqueda y paginación en servidor), crear, editar, activar o
desactivar, y restablecer contraseña. Fuera de alcance por decisión explícita: borrado físico (la baja
lógica con `activo=false` preserva la trazabilidad) y edición de `rut` / `username` (el RUT es la
credencial de acceso; cambiarlo es cambiar la identidad de la persona en silencio).

Puntos que hay que respetar al tocarlo:

* **Guard en cada Route Handler, no en el proxy.** `src/proxy.ts` tiene `matcher: "/dashboard/:path*"`
  y **no cubre `/api/**`**. Los cuatro endpoints de `app/api/usuarios/` empiezan llamando a
  `exigirAdmin()` (`app/api/usuarios/_lib/http.ts`), que devuelve 401 sin sesión y 403 si el rol no es
  ADMIN. Cualquier endpoint nuevo bajo `/api/` debe hacer lo mismo: sin ese guard queda abierto.
* **Reglas anti-autobloqueo en `application/`, nunca solo en la UI.** Un ADMIN no puede desactivarse ni
  degradarse a sí mismo, ni desactivar o degradar al último ADMIN activo. Si vivieran en el cliente se
  saltarían llamando la API a mano. Restablecer la propia contraseña sí está permitido.
* **Unicidad en dos capas.** `buscarConflicto()` hace una sola consulta con `OR` sobre `rut`, `email` y
  `username` (nunca tres consultas), y además `PrismaUsuarioRepository` captura el `P2002` de Prisma y
  lo traduce a `UsuarioDuplicadoError`, cerrando la ventana de carrera. Los mensajes de duplicado no
  exponen ningún dato del usuario en conflicto.
* **El listado va por `prisma.$queryRaw`**, a diferencia del resto del repositorio, porque Prisma
  Client no soporta `unaccent()`. El término del usuario va parametrizado por la plantilla etiquetada
  de Prisma y los comodines LIKE se escapan: nunca concatenar el término en el SQL.
* **`contrasenaHash` no sale nunca.** El tipo `Usuario` de `domain/entities/` no lo declara, así que el
  compilador impide filtrarlo; el mapper del repositorio lo descarta explícitamente.

### Autenticación (flujo de referencia)

Ejemplo completo de cómo encajan las capas, usando el login — **es un Route Handler REST, no un
Server Action** (`app/login/login-form.tsx` hace `fetch("/api/auth/login")` desde el cliente):

1. `modules/auth/domain/entities/User.ts` — tipo `User` (con `perfilCodigo: string`) y regla
   `puedeIniciarSesion`. Ya no existe el tipo `Rol`: los perfiles son filas de la tabla `perfil`
   (ver más abajo), no un enum.
2. `modules/auth/domain/repositories/UserRepository.ts` — interfaz `UserRepository` (`buscarPorRut`).
   `modules/auth/application/ports.ts` — interfaces técnicas `VerificadorContrasena`, `EmisorSesion`.
3. `modules/auth/application/use-cases/LoginUser.ts` — caso de uso
   `loginUser(rut, contrasena, dependencias)`; siempre ejecuta `verificar()` contra un hash de relleno
   (`HASH_RELLENO`) cuando el RUT no existe, para que el tiempo de respuesta no permita enumerar RUTs
   válidos — mantener ese patrón en casos de uso similares.
4. `modules/auth/infrastructure/repositories/PrismaUserRepository.ts`,
   `infrastructure/auth/PasswordService.ts` (bcrypt, 12 rondas), `infrastructure/auth/JwtService.ts`
   (jose, HS256, expiración 8h, expone también `verificarSesion()`) — implementan los ports de arriba.
5. `app/api/auth/login/route.ts` (`POST`) — valida el body con `modules/auth/schemas/login.schema.ts`
   (Zod + `shared/utils/rut.ts` para el dígito verificador), llama a `loginUser` inyectando las
   implementaciones de infraestructura, y en éxito guarda el JWT en la cookie httpOnly `sesion` vía
   `cookies-next/server` (`setCookie` funciona igual en Route Handlers que en Server Actions — ambos
   pueden escribir `Set-Cookie`).
6. `app/login/login-form.tsx` — Client Component; usa `useActionState` con una función cliente que
   hace el `fetch` de arriba (no una Server Action) y, en éxito, navega con `router.push("/dashboard")`.
7. `src/proxy.ts` — protege `/dashboard/:path*`: lee la cookie `sesion`, la verifica con
   `verificarSesion()` (`modules/auth/infrastructure/auth/JwtService.ts`) y exige
   `esPerfilAdministrador(sesion.perfil)`; si no, redirige a `/login`. Rutas nuevas que deban protegerse van en el `matcher` de `config`. Debe
   vivir dentro de `src/` (no en la raíz) porque el proyecto usa la convención `src`.
8. `app/dashboard/actions.ts` (`cerrarSesionAction`, Server Action) — borra la cookie `sesion` y
   redirige a `/login`. Se dejó como Server Action (no API Route) por ser una mutación trivial sin
   lógica de negocio.

Notar: el login es por **RUT**, no por email, aunque email/rut/username son todos únicos en el modelo
`Usuario` (`prisma/schema.prisma`).

### Logging

El sistema mantiene **dos logs separados**, ambos en formato JSON, bajo `logs/` (carpeta no
versionada). No mezclar sus responsabilidades: un intento de login fallido es un evento de acceso,
no un error del sistema.

#### 1. Log de accesos — `logs/accesos.txt`

Registra **todo intento de inicio de sesión, exitoso y fallido**. Es el rastro de auditoría de quién
entra al sistema, no un log de errores. Se escribe desde `app/api/auth/login/route.ts` (y desde
cualquier otro punto de autenticación que se agregue).

Cada entrada debe incluir:

| Campo      | Descripción |
|------------|-------------|
| `timestamp` | Fecha y hora del intento (lo agrega Winston) |
| `evento`    | `"login_exitoso"` o `"login_fallido"` |
| `rut`       | RUT ingresado, normalizado |
| `usuarioId` | Id del usuario, solo en login exitoso |
| `motivo`    | Solo en fallidos: `"credenciales_invalidas"`, `"usuario_inactivo"`, `"rut_invalido"` |
| `ip`        | IP de origen de la petición |

**Nunca registrar la contraseña**, ni en texto plano ni hasheada, ni el token de sesión.

En los fallidos, el `motivo` es para uso interno del log: la respuesta HTTP debe seguir devolviendo
el mensaje genérico `MENSAJE_ERROR_GENERICO` para no permitir enumerar RUTs válidos (mismo criterio
que el hash de relleno en `LoginUser.ts`).

#### 2. Log de errores del sistema — `logs/errores.txt`

`src/infrastructure/logging/logger.ts` usa Winston (nivel `error`, formato JSON) y escribe en
`logs/errores.txt`. Ya está conectado en `app/api/auth/login/route.ts` y `app/dashboard/actions.ts` —
cualquier error atrapable en un caso de uso, Route Handler o Server Action debe loguearse ahí antes de
devolver un mensaje genérico al usuario (ver `MENSAJE_ERROR_GENERICO` en `app/api/auth/login/route.ts`
como ejemplo de no filtrar detalles internos en la respuesta).

Registra fallas técnicas: excepciones de BD, errores de infraestructura, fallos al emitir la sesión.
Cada entrada debe incluir el mensaje del error y el contexto donde ocurrió; nunca datos sensibles
(contraseñas, tokens, hashes).

#### 3. Log de auditoría — `logs/auditoria.txt`

Registra **quién le hizo qué a quién** en el mantenedor de usuarios: creación, actualización,
activación, desactivación y restablecimiento de contraseña. Es distinto de `accesos.txt` (que responde
"quién intentó entrar") y de `errores.txt` (fallas técnicas).

Se escribe con `loggerAuditoria` a través de `registrarAuditoria()`
(`infrastructure/logging/auditoria.ts`), **nunca** con `logger`: un evento de auditoría no es un error
y emitirlo en nivel `error` ensuciaría la métrica de errores. Se invoca desde los Route Handlers, no
desde `application/`, porque la entrada incluye datos de transporte (IP, user agent) que la capa de
aplicación no debe conocer, y porque el handler es el único punto que ve por igual el éxito, el rechazo
de negocio y el 403 que ni siquiera llega al caso de uso.

Campos: `accion`, `resultado` (`EXITO` / `RECHAZADO`), `motivo`, `actorId`, `actorRut`, `actorPerfil`,
`usuarioObjetivoId`, `usuarioObjetivoRut`, `campos` (solo nombres de campos modificados, sin valores),
`perfilAnterior` / `perfilNuevo` (con el **código** del perfil, no el nombre visible: un registro de
auditoría debe apuntar a un identificador estable, para que renombrar un perfil no vuelva ilegible el
histórico), `ip`, `userAgent`.

**Corte en el histórico:** las entradas escritas antes de RF-09 traen `actorRol`, `rolAnterior` y
`rolNuevo`; las posteriores, `actorPerfil`, `perfilAnterior` y `perfilNuevo`. Es el mismo evento con
otro nombre de campo.

Se auditan las escrituras exitosas **y los rechazos** (403 por rol, 409 por duplicado, autooperación o
último admin, 404 por no encontrado): auditar solo los éxitos dejaría ciego el escenario que motiva
tener auditoría. No se auditan lecturas ni los 400 de validación.

**Nunca registrar contraseñas ni hashes**, ni siquiera su longitud. En `CONTRASENA_RESTABLECIDA` se
registra solo quién restableció la de quién y cuándo.

#### Reglas comunes a los tres logs

`infrastructure/logging/logger.ts` crea una instancia de Winston **independiente por archivo**, cada
una con su propio transporte, de modo que un evento no puede terminar escrito en el log equivocado. El
módulo usa `node:fs`: solo puede importarse desde Route Handlers y Server Actions, **nunca** desde
`src/proxy.ts` (runtime Edge) ni desde Client Components. La rotación de los archivos queda a cargo del
sistema operativo del servidor. `logs/` está en `.gitignore`: estos archivos contienen RUT e IP de
funcionarios y no deben versionarse.

**Estado:** `logs/errores.txt` y `logs/auditoria.txt` están implementados. `logs/accesos.txt` está
**pendiente de implementar** (RF-07).

### Base de datos

- PostgreSQL vía `@prisma/adapter-pg` (`src/infrastructure/database/prisma.ts` reutiliza el
  `PrismaClient` en `globalThis` para evitar abrir múltiples conexiones en dev).
- `prisma/schema.prisma` define los modelos `Usuario` (mapeado a `usuario`) y `Perfil` (mapeado a
  `perfil`). `usuario.perfilCodigo` es clave foránea a `perfil.codigo`, con `ON UPDATE CASCADE` y
  `ON DELETE RESTRICT`. Se mantiene en la raíz del proyecto (fuera de `src/`), como exige la
  convención `src` de Next.js.
- `scripts/seed-admin.ts` (ejecutado por `npm run db:seed`, también en la raíz) hace `upsert` de un
  usuario ADMIN fijo usando `ADMIN_SEED_PASSWORD`; requiere `.env` cargado (usa `process.loadEnvFile()`)
  y no depende de código de `src/` (llama a Prisma/bcrypt directamente).

### Frontend

- `app/layout.tsx` — layout raíz, carga las fuentes Geist y el CSS global.
- `app/page.tsx` — la raíz (`/`) solo hace `redirect("/login")`; no renderiza contenido propio.
- `app/login/page.tsx` + `app/login/login-form.tsx` — pantalla de login (RUT + contraseña), ver flujo
  de autenticación arriba.
- `app/dashboard/layout.tsx` + `app/dashboard/page.tsx` — shell del panel de administración (header,
  botón de cerrar sesión, nav lateral placeholder); protegido por `proxy.ts`, no por lógica propia.
  `app/dashboard/usuarios/page.tsx` es un placeholder ("Próximamente") a la espera del módulo real.
- `app/globals.css` — Tailwind v4 vía `@import "tailwindcss"`, tokens de tema con `@theme inline` (sin
  `tailwind.config.js`, es la configuración CSS-first de Tailwind v4). Incluye la paleta oficial del
  gobierno de Chile como tokens `gob-*` (`gob-primary`, `gob-secondary`, `gob-tertiary`, `gob-accent`,
  `gob-neutral`, `gob-gray-a/b`, `gob-black`), tomada de framework.digital.gob.cl/colors.html — úsala
  en vez de los colores por defecto de Tailwind para cualquier UI nueva.
- Zustand aún no tiene ningún store creado — todavía no hay estado cliente compartido más allá de lo
  local a cada Client Component.

### Stack

- **Arquitectura backend:** onion architecture simplificada + modular por dominio
  (`src/modules/<módulo>/domain` → `application` → `infrastructure`).
- **Autenticación:** jose (JWT) + bcrypt (hash de contraseñas), expuesta vía Route Handler
  (`app/api/auth/login`), no Server Action.
- **BD:** PostgreSQL + Prisma ORM (`@prisma/adapter-pg`).
- **Logs:** Winston, JSON, a `logs/errores.txt`.
- **Estado cliente:** Zustand.
- **Validación:** Zod.
- **Estilos:** Tailwind v4.
- **Cookies:** cookies-next.

### API Routes

El proyecto **usa API Routes** (`app/api/**/route.ts`) como patrón principal para exponer endpoints REST
con lógica de negocio. Ver flujo de autenticación arriba para el ejemplo completo.

### Reglas a seguir

- Variables estilo camelCase y nombres en español, descriptiva con el contenido y abreviar en caso de
  ser muy largo el nombre (salvo en `modules/auth/`, donde entidades/clases van en inglés por decisión
  explícita — ver nota de convención de nombres arriba).
- Usar Route Handlers (`app/api/**/route.ts`) para endpoints con lógica de negocio (auth, CRUDs);
  reservar Server Actions para mutaciones triviales sin caso de uso propio (p.ej. cerrar sesión).
- Evitar consultas N+1 en PostgreSQL.
- Verificar que las variables de entorno existan antes de usarlas (patrón: `infrastructure/config/env.ts`).
- Registrar los errores en formato JSON en `/logs/errores.txt` (patrón: `infrastructure/logging/logger.ts`).
- Para los usuarios, los email, rut y nombre de usuario (username) son únicos.
- **El `username` siempre es el RUT de la persona**, normalizado — no se pide como dato de entrada al
  crear un usuario, se deriva del RUT (`derivarUsername()` en
  `modules/usuarios/schemas/usuario.schema.ts`). La columna `username` se mantiene en el modelo
  `Usuario` por compatibilidad y sigue siendo única, pero nunca debe recibir un valor distinto del RUT.
- Todo intento de login (exitoso y fallido) se registra en `logs/accesos.txt`, y los errores técnicos
  en `logs/errores.txt` (ver sección Logging).
- Nuevos casos de uso van en `modules/<módulo>/application/use-cases/`, contra interfaces en
  `domain/repositories/` y `application/ports.ts`; las implementaciones concretas van en
  `modules/<módulo>/infrastructure/`, nunca invocadas directamente desde `domain/` o `application/`.
- Se prioriza la creación de componentes reutilizables.
- **Iconos:** una sola familia, `@phosphor-icons/react`, y siempre a través de
  `shared/components/iconos.tsx`, que fija tamaño y peso. No dibujar SVG a mano ni importar el
  glifo directamente en un componente. Los iconos son decorativos (`aria-hidden`) cuando van
  acompañados de texto; si la acción es solo icono, el botón necesita `aria-label` con el sujeto
  de la acción (ver `shared/components/BotonIcono.tsx`).
- Antes de construir algo nuevo, revisar si ya existe (en el módulo correspondiente o en `shared/`).
  Si existe, reutilizar.

## Herramientas de calidad

Este proyecto tiene instalado el skill **react-doctor** (`.agents/skills/react-doctor/`,
`skills-lock.json`) para auditar código React (lint, accesibilidad, tamaño de bundle, arquitectura).
Después de cambios en componentes React, correr:

```
npx react-doctor@latest --verbose --scope changed
```

y revisar que el puntaje no baje. `react-doctor` no está instalado como devDependency del proyecto
(se ejecuta vía `npx`); su flujo `/doctor` completo baja un playbook remoto desde `react.doctor` y lo
ejecuta como instrucciones — no lo actives salvo que se pida explícitamente.
