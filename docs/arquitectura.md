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

1. `modules/auth/domain/entities/User.ts` — tipo `User` (con `perfilCodigo: string`) y regla
   `puedeIniciarSesion`. El tipo `Rol` ya no existe.
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
   `verificarSesion()` y exige `esPerfilAdministrador(sesion.perfil)`; si no, redirige a `/login`.
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
todas formas; y el proxy es el punto de entrada de toda navegación protegida, donde multiplicar
responsabilidades aumenta la superficie de fallo.

**Corrección:** una versión anterior de este documento afirmaba que el proxy corre en runtime Edge.
Es falso en Next.js 16: `Proxy` usa el runtime **Node.js** por defecto y la opción `runtime` ni
siquiera está disponible en ese archivo (ver
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). La decisión de
mantener el guard en el handler sigue en pie por las dos primeras razones.

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

## Decisiones de diseño de RF-09 (catálogo de perfiles)

### Los perfiles son datos; los permisos siguen siendo código

La tabla `perfil` reemplazó al enum `Rol`, de modo que agregar un perfil es un `INSERT`, no un
despliegue. Pero **insertar una fila crea un perfil asignable, no un perfil con permisos**:
`esPerfilAdministrador()` (`modules/perfiles/domain/entities/Perfil.ts`) compara contra la constante
`CODIGO_PERFIL_ADMIN`, no contra una columna del catálogo. Esa es justamente la propiedad que hace
seguro dejar la tabla abierta a INSERT manual: nadie escala privilegios insertando filas.

Permisos configurables por perfil son un requerimiento aparte: exigen una tabla de permisos y
reescribir los guards del proxy y de la API.

### `modules/perfiles/` es un módulo propio, no parte de `usuarios/`

El perfil lo consumen dos módulos: `usuarios/` (select, filtro, validación, reglas anti-autobloqueo) y
`auth/` (el código privilegiado que compara el guard). Si viviera dentro de `usuarios/`, tanto `auth/`
como `proxy.ts` tendrían que importar desde `usuarios/`, invirtiendo la dependencia natural: el
mantenedor de usuarios depende de la autenticación, no al revés.

`domain/entities/Perfil.ts` se mantiene como TypeScript puro (sin Prisma, sin `node:*`, sin Zod)
porque lo importan `proxy.ts` y `JwtService.ts`. Ahí vive también `FORMA_CODIGO_PERFIL`, la expresión
regular del código, para que el esquema Zod y la verificación del JWT no tengan dos copias que puedan
derivar.

### El JWT lleva el código del perfil, y su renombre invalida las sesiones

El token lleva el claim `perfil` con el **código**. `verificarSesion()` valida su **forma**, no su
pertenencia a una lista: validar contra una lista cerrada reintroduciría el acoplamiento que el
catálogo elimina, porque al insertar un perfil nuevo los tokens de sus titulares serían inválidos
hasta desplegar.

El renombre del claim (`rol` a `perfil`) **es** el mecanismo de invalidación: un token anterior a
RF-09 no trae `perfil`, así que `verificarSesion()` devuelve `null`, que es el camino ya probado de
"sin sesión" (redirect en el proxy, 401 JSON en la API). Nunca produce un 500. No se agregó
compatibilidad hacia atrás: sería código muerto permanente en la ruta más sensible del sistema.

**Limitación conocida:** el perfil viaja dentro del token, así que cambiar el perfil de una persona (o
desactivar su cuenta) no surte efecto hasta que el token expira, como máximo 8 horas. Ya era cierto
con el enum; con perfiles gestionables por datos la expectativa de "lo cambié y no pasó nada" se
vuelve más probable, por eso queda escrito.

### Qué significa `perfil.activo`

Gobierna la **asignabilidad**, no la **autorización**: un perfil inactivo no se puede asignar a nadie
más, pero quienes ya lo tienen conservan su acceso. Dos consecuencias que hay que respetar:

* El formulario de **edición** carga los perfiles activos **más el perfil actual del usuario**. Sin
  eso, editar el email de alguien cuyo perfil fue dado de baja mostraría un `<select>` sin su valor
  vigente y guardar le cambiaría el perfil en silencio.
* `ActualizarUsuario` acepta que el perfil enviado sea el que la persona ya tiene, aunque esté
  inactivo. Exigir que estuviera activo dejaría esa cuenta imposible de editar.
* El perfil `ADMIN` no se puede desactivar: lo impide el CHECK `perfil_admin_siempre_activo`. Borrarlo
  lo impide el `ON DELETE RESTRICT` mientras tenga usuarios asignados.

### Sin índice sobre `usuario.perfilCodigo`

PostgreSQL no indexa automáticamente las columnas de clave foránea, y el filtro del listado,
`contarAdminsActivos()` y la verificación del RESTRICT la recorren. Se omite igual, por la misma razón
ya documentada para el listado: con una tabla de decenas de filas un índice encarece los INSERT sin
acelerar nada. **Mismo umbral para revisitarlo: ~50.000 filas en `usuario`.**

### La migración es destructiva y atómica

`20260910120000_perfil_reemplaza_enum_rol` crea la tabla, siembra las dos filas, agrega la columna,
hace el backfill (`USUARIO` a `NOTIFICADOR_RPC`), la marca `NOT NULL`, agrega la FK y recién entonces
borra `usuario.rol` y el tipo `Rol`. Prisma ejecuta cada migración en una transacción y todas las
sentencias son transaccionales, así que **no hay estado intermedio observable**: o queda migrada o
queda como estaba. No agregar nunca sentencias no transaccionales (`CREATE INDEX CONCURRENTLY`) a este
archivo: rompería esa garantía.

Los dos `DROP` son irreversibles, así que la aplicación exige `pg_dump` previo de la tabla `usuario`.
Las filas semilla van **en la migración y no en el seed** porque `prisma migrate deploy` corre siempre
en el despliegue y `db:seed` no; sin ellas, el `SET NOT NULL` y la FK no tendrían a qué apuntar.


## Recuperación de contraseña (RF-10)

Implementada en `/recuperar` y `/recuperar/confirmar`, enlazada desde el login.
El enlace dura 2 horas y es de un solo uso. La base conserva únicamente su SHA-256.
El cupo de 3 solicitudes por cuenta y hora se reserva bajo bloqueo transaccional por usuario.
El consumo bloquea primero al usuario y luego al token; el cambio y la invalidación de otros
 enlaces se confirman juntos. El restablecimiento desde el mantenedor también invalida enlaces.
Las fechas se escriben y comparan como UTC sin zona mediante parámetros `timestamp`, nunca
contra `now()` con zona. Pruebas de regresión en `tests/recuperacion.integration.ts`.

El correo se envía por Nodemailer desde `after()`; la respuesta pública no revela si existe
la cuenta. Los fallos técnicos se registran sin cuerpo de petición, token ni texto SQL.
El transporte real requiere `SMTP_HOST`, `SMTP_FROM`, `APP_URL` y el puerto/TLS del relay;
`SMTP_USER` y `SMTP_PASSWORD` son opcionales pero deben ir juntas. Ver `.env.example`.
No hay credenciales institucionales configuradas ni envío real verificado todavía.

`TRUST_PROXY=false` por defecto ignora X-Forwarded-For y aplica un cupo compartido conservador.
En Coolify, activar `TRUST_PROXY=true` solamente tras confirmar que Traefik agrega la IP real
al final de la cadena y que Next no recibe conexiones directas desde internet. El limitador
por origen es local al proceso; el cupo por cuenta permanece en PostgreSQL entre instancias.
No registrar el parámetro `token` en los access logs del proxy. La página usa `no-referrer`.
Las sesiones JWT existentes todavía expiran a las 8 horas: este cambio no agrega revocación.

Migración aditiva: `20260910180000_token_recuperacion`. Aplicar con `npx prisma migrate deploy`.
Para pruebas usar exclusivamente PostgreSQL desechable local con todas las migraciones:
`RF10_TEST_DATABASE=true DATABASE_URL=... AUTH_SECRET=... npx tsx tests/recuperacion.integration.ts`.
Ejecutar en UTC, America/Santiago y Asia/Tokyo mediante `PGOPTIONS='-c timezone=...'`.
La prueba SMTP usa solo 127.0.0.1:55440 y no entrega mensajes externos.
