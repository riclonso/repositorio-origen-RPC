# Arquitectura

Última actualización: 2026-09-14 (RF-15 y su ampliación: tipo de archivo por ventana + publicación)

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
│   ├── auth/               — login, recuperación de contraseña (RF-10), sesión
│   │   ├── domain/         — entities/ (User.ts, PasswordResetToken.ts), repositories/ (interfaces)
│   │   ├── application/    — ports.ts, use-cases/ (LoginUser, RequestPasswordReset, ResetPassword)
│   │   ├── infrastructure/ — repositories/, auth/ (PasswordService, JwtService, SesionActual),
│   │   │                     email/PasswordResetMailer.ts, tokens/TokenService.ts, auditoria/
│   │   └── schemas/        — login.schema.ts, recuperacion.schema.ts (Zod)
│   ├── perfiles/           — catálogo de perfiles (RF-09), solo lectura; mismo patrón de capas
│   │   └── domain/entities/Perfil.ts — esPerfilAdministrador, esPerfilNotificador, CODIGO_PERFIL_*
│   ├── usuarios/           — mismo patrón; mantenedor de usuarios (RF-06, implementado)
│   ├── formatos-excel/     — mantenedor de formatos de archivo (RF-13, implementado; reglas de
│   │                         validación por conjunto de columnas y `tipoArchivo` agregados como
│   │                         extensión)
│   │   ├── domain/         — entities/FormatoExcel.ts (incluye ReglaValidacionFormatoExcel,
│   │   │                     TIPOS_REGLA_VALIDACION, TIPOS_ARCHIVO/TipoArchivo — informativo, ya
│   │   │                     no compartido con `ventanas-carga/domain` tras la corrección que
│   │   │                     reemplazó `VentanaCarga.tipoArchivo` por `formatoExcelId`),
│   │   │                     repositories/, errors/FormatoDuplicadoError.ts
│   │   ├── application/    — ports.ts (LectorPlantilla), use-cases/ (Leer/Crear/Listar/Obtener/Actualizar/CambiarEstado/ObtenerPlantilla)
│   │   ├── infrastructure/ — repositories/PrismaFormatoExcelRepository.ts,
│   │   │                     lectura-plantilla/LectorPlantillaExcelJs.ts (exceljs), auditoria/
│   │   └── schemas/        — formato-excel.schema.ts (Zod; valida también las reglas y que sus
│   │                         columnas existan entre las columnas del mismo payload)
│   ├── reporte-excel/      — subida y validación de archivos de reporte (RF-14, implementado)
│   │   ├── domain/         — entities/CargaArchivo.ts, repositories/
│   │   ├── application/    — use-cases/ (ValidarYCargarArchivo, DarVistoBueno, Listar/Obtener*)
│   │   ├── infrastructure/ — repositories/PrismaCargaArchivoRepository.ts,
│   │   │                     validacion/ (ValidadoresTipoDato, EvaluadorReglasValidacion),
│   │   │                     lectura-archivo/LectorArchivoReporteExcelJs.ts, auditoria/
│   │   └── schemas/        — reporte-excel.schema.ts
│   └── ventanas-carga/     — ventanas de tiempo para carga de archivos (RF-15, implementado)
│       ├── domain/         — entities/VentanaCarga.ts (incluye estaAbierta, sin estado persistido;
│       │                     referencia un `FormatoExcel` concreto vía `formatoExcelId`, no un
│       │                     `TipoArchivo` genérico), entities/rangoAnio.ts (fechaDentroDelAnio),
│       │                     repositories/, errors/VentanaCargaDuplicadaError.ts,
│       │                     errors/FormatoInvalidoVentanaCargaError.ts
│       ├── application/    — use-cases/ (Crear/EditarFechas/Listar/ListarAniosDisponibles/Obtener)
│       ├── infrastructure/ — repositories/PrismaVentanaCargaRepository.ts, auditoria/
│       └── schemas/        — ventana-carga.schema.ts (anioVentanaCargaSchema reutilizado por
│                             `reporte-excel/schemas/reporte-excel.schema.ts`, para no duplicar rango)
├── infrastructure/         — transversal
│   ├── database/prisma.ts, config/env.ts
│   ├── logging/            — logger.ts, auditoria.ts, leerLogs.ts, logUpload.ts (preparado, sin conectar — ver RF-13)
│   ├── email/SmtpMailer.ts
│   └── rate-limit/LimitadorMemoria.ts   — cupo de recuperación de contraseña (RF-10)
├── proxy.ts                — guard de sesión por área protegida (reemplaza a middleware.ts en Next.js 16)
└── shared/
    ├── components/          — CampoTexto, CampoContrasena, CampoSelect, CampoSeleccionMultiple, Boton, DialogoConfirmacion, EncabezadoPanel, NavegacionPanel
    ├── acciones/            — cerrarSesion.ts (Server Action compartida por los paneles)
    ├── schemas/             — contrasena.schema.ts (reglas de complejidad compartidas)
    └── utils/               — rut.ts, peticion.ts (extraerIp, para el limitador de RF-10)
```

Bajo `app/` hay dos áreas de panel, una por perfil: `app/dashboard/` (solo ADMIN) y
`app/notificador/` (solo NOTIFICADOR_RPC), más un despachador `app/inicio/` al que llega el login y
que redirige a cada perfil a su panel. Ver "Panel del perfil NOTIFICADOR_RPC (RF-12)".

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
7. `src/proxy.ts` — `matcher: ["/dashboard/:path*", "/notificador/:path*"]`. Lee la cookie `sesion`,
   la verifica con `verificarSesion()` y aplica chequeo positivo por área (`esPerfilAdministrador` /
   `esPerfilNotificador`); sin sesión redirige a `/login`, con sesión pero perfil equivocado para el
   área redirige a `/inicio`. Detalle completo en "Panel del perfil NOTIFICADOR_RPC (RF-12)" más abajo.
8. `shared/acciones/cerrarSesion.ts` (`cerrarSesionAction`, Server Action) — borra la cookie y
   redirige a `/login`; vive en `shared/` porque la usan los layouts de `/dashboard` y `/notificador`.

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
* `prisma/schema.prisma` define los modelos `Usuario` (`usuario`), `Perfil` (`perfil`, RF-09),
  `TokenRecuperacion` (RF-10), y desde RF-13 `FormatoExcel` (`formato_excel`),
  `ColumnaFormatoExcel` (`columna_formato_excel`), `UsuarioFormatoExcel`
  (`usuario_formato_excel`, N:M explícito entre `Usuario` y `FormatoExcel`, mismo patrón que
  `TokenRecuperacion`: id propio en vez del m2m implícito de Prisma) y, como extensión de RF-13,
  `ReglaValidacionFormatoExcel` (`regla_validacion_formato_excel`, `ON DELETE CASCADE` desde
  `FormatoExcel`, `@@unique([formatoExcelId, orden])` igual que `ColumnaFormatoExcel`; sus
  columnas se referencian por nombre —`String[]`—, no por FK, porque `actualizar()` regenera los
  ids de `ColumnaFormatoExcel` en cada edición). Desde RF-14, `CargaArchivo` (`carga_archivo`,
  `ON DELETE RESTRICT` desde `Usuario`/`FormatoExcel`) y `ErrorCargaArchivo`
  (`error_carga_archivo`, `ON DELETE CASCADE` desde `CargaArchivo`). Desde RF-15,
  `VentanaCarga` (`ventana_carga`, único parcial sobre `(anio, formatoExcelId)` mientras
  `eliminadaEn IS NULL`, `ON DELETE RESTRICT` desde `Usuario` vía `creadoPorId` y desde
  `FormatoExcel` vía `formatoExcelId` — corrección posterior que reemplazó el enum `tipoArchivo`
  por una referencia directa a un formato concreto) y `CargaArchivo.ventanaCargaId` (FK a
  `VentanaCarga`, `ON DELETE RESTRICT`).
  `usuario.perfilCodigo` es FK a `perfil.codigo` (`ON UPDATE CASCADE`, `ON DELETE RESTRICT`).

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

## Panel del perfil NOTIFICADOR_RPC (RF-12)

### Áreas top-level separadas por perfil, no `/dashboard` compartido

Cada perfil tiene su propia área bajo `app/`: `app/dashboard/` (solo ADMIN) y `app/notificador/`
(solo NOTIFICADOR_RPC). Se descartó compartir `/dashboard` con secciones gateadas por perfil.

La razón es el invariante más fuerte del proyecto: **todo lo que cuelga de `/dashboard` es solo-ADMIN,
igual que `/api/usuarios/*`**. Con áreas separadas, el proxy protege cada una con una igualdad de
perfil simple y positiva, y ese invariante se mantiene por construcción. Compartir `/dashboard`
obligaría a degradar la regla del proxy de "subárbol de admin" a "subárbol autenticado" y mover la
autorización real a cada subsección, multiplicando la superficie donde una sección sin su propio
guard expondría en silencio una función de admin — justo el "gateo solo en UI" que `CLAUDE.md`
prohíbe. Para dos perfiles no aporta nada y agrega refactor y riesgo.

### El proxy hace chequeo positivo por área; `/inicio` despacha

`src/proxy.ts` usa `matcher: ["/dashboard/:path*", "/notificador/:path*"]` y corre en runtime
**Node.js** (no Edge, ver aviso de Next 16), por lo que importa `verificarSesion` y los helpers de
dominio. Lógica: sin sesión válida → `/login`; bajo `/dashboard` y `!esPerfilAdministrador` → `/inicio`;
bajo `/notificador` y `!esPerfilNotificador` → `/inicio`; si no, `next()`. El chequeo es **positivo**
por área (no "autenticado y no-admin"): un tercer perfil futuro no se cuela en un panel ajeno. A un
perfil que entra al área equivocada se le reenvía a `/inicio` (su propio panel), no a `/login`: ya
tiene sesión, y mandarlo a login simularía una expiración.

`app/inicio/page.tsx` es un Server Component despachador que **no** está en el matcher (se autoguarda
leyendo la cookie con `obtenerSesionActual()`): sin sesión o perfil desconocido → `/login`; ADMIN →
`/dashboard`; NOTIFICADOR_RPC → `/notificador`. Nunca renderiza contenido. Es la única fuente de
"dónde aterriza cada perfil".

### Navegación post-login consciente del perfil, sin que el cliente conozca el perfil

`app/login/login-form.tsx` navega (duro, `window.location.assign`) a `/inicio`, no a una ruta fija de
panel. El cliente no decide el destino: el servidor lo despacha en `/inicio`. Se mantiene la
navegación **dura** (no `router.push`) porque una navegación suave del App Router puede reutilizar una
entrada previa de la caché de rutas del cliente —por ejemplo el rebote de un perfil sin acceso— en vez
de reevaluar el proxy con la cookie recién emitida; está documentado en ese archivo.

### Shell compartido por ambos paneles

El header y la navegación lateral se extrajeron a `shared/` parametrizados por datos, para no duplicar
el estilo `gob-*`, el botón de cerrar sesión ni la lógica de estado activo/`aria-current`:
`shared/components/EncabezadoPanel.tsx` (branding + cerrar sesión), `shared/components/NavegacionPanel.tsx`
(Client Component con `usePathname`; recibe `enlaces` y `titulo`), y `shared/acciones/cerrarSesion.ts`
(Server Action, movida desde `app/dashboard/`) para que `app/notificador/` no dependa de `app/dashboard/`.
Los enlaces y el título de cada panel viven en su propio `nav-enlaces.ts`.

### Saludo con el nombre: `buscarPorId` en el repositorio de `auth`

La bienvenida muestra el nombre del usuario. El JWT solo lleva `sub` (id) y `perfil`, así que se agregó
`buscarPorId(id)` a `modules/auth/domain/repositories/UserRepository.ts` y su implementación en
`PrismaUserRepository.ts`, reutilizando el mapper `aUser` de `buscarPorRut`. La página obtiene la sesión,
resuelve el usuario por id y saluda con `nombres`; el `contrasenaHash` no se serializa al cliente (la
página solo lee `nombres`). Si el usuario no existe con sesión vigente (caso borde: cuenta borrada), la
página redirige a `/login` en vez de renderizar un panel sin dueño. Esta lectura trivial llama al
repositorio directamente desde `app/`; cuando aparezca lógica de negocio debe encapsularse en un caso de
uso en `modules/auth/application/use-cases/`.

Limitación heredada de RF-09: el perfil viaja en el JWT de 8 h, así que un cambio de perfil o una
desactivación no surten efecto hasta que expire el token.

## Mantenedor de formatos de archivo (RF-13)

### Helpers de API genéricos extraídos a `app/api/_lib/http.ts`

`exigirAdmin()`, `respuestaError()`, `respuestaSinAcceso()` y el `idRutaSchema` (validación de un
id de ruta como UUID) dejaron de vivir únicamente en `app/api/usuarios/_lib/http.ts` y se movieron
a `app/api/_lib/http.ts`, reutilizable por cualquier carpeta de API. `usuarios/_lib/http.ts` y el
nuevo `formatos-excel/_lib/http.ts` los reexportan sin cambiar los imports existentes del
mantenedor de usuarios, y agregan encima solo lo específico de su dominio (DTOs, mensajes,
traducción de errores propios: `respuestaDuplicado`, `respuestaPerfilInvalido`,
`respuestaFormatoExcelInvalido`, `respuestaArchivoInvalido`). Regla para módulos nuevos: los
helpers verdaderamente genéricos van en `app/api/_lib/`; lo que conoce el dominio se queda en el
`_lib/http.ts` de esa carpeta.

### `contenidoPlantilla` nunca sale del repositorio salvo en `obtenerPlantilla()`

Mismo patrón que `contrasenaHash` en `Usuario`: el tipo de dominio `FormatoExcel` no tiene el
campo, y todos los `select` de Prisma en `PrismaFormatoExcelRepository` lo excluyen
explícitamente. Solo `obtenerPlantilla(id)` (usado exclusivamente por
`GET /api/formatos-excel/[id]/plantilla`) hace un `select` que sí lo trae, con su propio tipo
`PlantillaFormatoExcel` separado. Esto hace estructuralmente imposible que un listado o un detalle
filtre el binario por descuido.

### El tipo de contenido lo decide el servidor, en dos capas — nunca el `Content-Type` del cliente

`tipoContenidoDesdeNombre()` (`app/api/formatos-excel/_lib/http.ts`) deriva
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` o `text/csv` a partir de la
extensión del archivo (`.xlsx`/`.csv`), no del `Content-Type` que declara el `multipart/form-data`
(ese header es trivial de falsificar). Pero la extensión del nombre es **igual de falsificable**
(basta renombrar el archivo), así que es solo el filtro barato inicial (rechaza extensiones no
soportadas sin leer el archivo, antes de gastar tamaño/CPU en algo que ya se sabe inválido).

La validación real ocurre después, sobre el contenido: `tipoContenidoDesdeArchivo(nombre, buffer)`
verifica que los primeros 4 bytes de un `.xlsx` coincidan con la firma ZIP `PK\x03\x04` (OOXML es un
contenedor ZIP), y que un `.csv` no contenga un byte NUL en los primeros 8000 bytes (heurística
binario-vs-texto; la validación estructural fina queda para `exceljs` al parsear). Solo el resultado
de esta segunda verificación se persiste en `formato_excel.tipoContenidoPlantilla` — el valor que
luego se sirve tal cual en el `Content-Type` de la descarga. Orden en ambos endpoints
(`leer-plantilla` y la creación): tamaño máximo (10 MB) → extensión → firma de contenido → recién
ahí se lee con `exceljs` o se persiste, para no gastar trabajo en un archivo que ya iba a
rechazarse por una verificación más barata.

**Limitación conocida:** el heurístico de CSV solo cubre UTF-8 (ya era la única codificación
soportada por `LectorPlantillaExcelJs`); un CSV real en UTF-16 se rechazaría por contener bytes NUL,
pero eso ya era una limitación preexistente, no una introducida por esta verificación.

### La regla "todo NOTIFICADOR_RPC tiene al menos un formato" vive en Zod + `application/`, no en la BD

Con una relación N:M no es expresable como `CHECK` de una sola tabla (haría falta un trigger, que
el proyecto evita). Se aplica dos veces por defensa en profundidad: `usuario.schema.ts`
(`.superRefine`, cruzando `perfilCodigo` y `formatosExcelIds`) rechaza el payload en el borde, y
`CrearUsuario`/`ActualizarUsuario` verifican además que cada id exista y esté activo con **una
sola consulta** (`FormatoExcelRepository.obtenerActivosEntre(ids)`), nunca un loop por id. En
edición, los formatos que la persona ya tenía se conservan aunque hayan sido dados de baja (mismo
criterio que "conserva su perfil actual" de RF-09); solo los ids nuevos deben estar vigentes.

### Reemplazo de un conjunto de filas hijas como una sola escritura atómica

Tanto "reemplazar todas las columnas de un formato" (`FormatoExcelRepository.actualizar`) como
"reemplazar todos los formatos asignados a un usuario" (`UsuarioRepository.actualizar`) usan el
mismo patrón: `relacion: { deleteMany: {}, create: [...] } }` dentro de una única llamada a
`prisma.<modelo>.update(...)`. Prisma ejecuta los nested writes de una misma llamada como una
operación atómica, así que no hace falta envolverlos en un `$transaction` explícito para que el
conjunto nunca quede a medio reemplazar.

### `exceljs` solo detrás del puerto `LectorPlantilla`

`application/` no importa `exceljs` directamente: depende de la interfaz `LectorPlantilla`
(`modules/formatos-excel/application/ports.ts`), implementada en
`infrastructure/lectura-plantilla/LectorPlantillaExcelJs.ts`. La rama `.csv` envuelve el `Buffer`
con `Readable.from()` (`node:stream`) porque `workbook.csv.read()` espera un stream, y se lee solo
con separador coma y UTF-8 (sin opciones adicionales: `;` u otras codificaciones quedan fuera de
este alcance). **Nota de compatibilidad de tipos:** el `.d.ts` de `exceljs` 4.4.0 declara un
`Buffer` ambiental propio (`declare interface Buffer extends ArrayBuffer {}`) que, bajo
`lib: ["esnext"]` (este proyecto), no es asignable al `Buffer` real de Node — es un bug de tipos de
la librería, no del dato. Se resuelve con una aserción de tipo puntual en la llamada a
`workbook.xlsx.load()`; en runtime sigue siendo el `Buffer` de Node.

### La plantilla persistida no se reemplaza al editar

`PUT /api/formatos-excel/[id]` solo actualiza `nombre`, `descripcion` y el set completo de
columnas; nunca toca `contenidoPlantilla`/`nombreArchivoPlantilla`/`tipoContenidoPlantilla`.
Cambiar el archivo de ejemplo de un formato existente requiere crear un formato nuevo (decisión ya
tomada, evita tener que re-conciliar columnas ya configuradas contra un archivo distinto).

### `<form action={función}>` de `useActionState` resetea campos controlados: usar `onSubmit` + `startTransition`

Descubierto verificando el selector múltiple de formatos en `usuario-form.tsx`: React 19 solo
reconoce un `<form>` como "host action" (y por lo tanto le engancha su `.reset()` nativo al terminar
la `action`, pensado para limpiar campos *no* controlados) cuando la prop `action` del elemento es
una función — es decir, exactamente el patrón `<form action={enviarFormulario}>` que usa
`useActionState`. Si un envío falla y el valor de un `<select>`/checkbox controlado **no cambió**
respecto al render anterior (el caso típico: el operador reenvía sin tocar ese campo), React no
vuelve a escribir esa propiedad sobre el DOM al reconciliar, y el `.reset()` nativo deja un valor
visualmente distinto al que el operador realmente seleccionó — aunque el estado de React interno
siga siendo correcto. Los `<input>` de texto no sufren esto (React sí los resincroniza en cada
commit); intentar forzarlo con un `key` que cambie tampoco alcanza, porque el commit confirma los
hijos antes de procesar el flag `Reset` del `<form>` padre, así que el `.reset()` pisa igual el
remount en el mismo commit.

**Fix:** no usar `action={función}` como prop del `<form>`. En su lugar:

```tsx
<form
  onSubmit={(evento) => {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    startTransition(() => enviarFormulario(formData));
  }}
>
```

Al no reconocer el `<form>` como host action, React nunca engancha el `.reset()` nativo. El
`enviarFormulario` que devuelve `useActionState` se puede invocar como función normal — el
tracking de `isPending` no depende de pasar por la prop `action`, sino de que la llamada ocurra
dentro de una `startTransition` (sin ella, React tira un warning en consola y `isPending` deja de
reflejar la petición en curso).

**Pendiente, fuera de alcance de RF-13:** el mismo patrón (`<form action={dispatch de
useActionState}>` con campos controlados) está presente en `app/recuperar/recuperar-form.tsx`,
`app/recuperar/confirmar/confirmar-form.tsx` y `app/dashboard/usuarios/[id]/contrasena/contrasena-form.tsx`.
Hoy es inofensivo ahí (ninguno tiene un `<select>`/checkbox; el único síntoma sería que el campo de
contraseña se ve vacío tras un error y hay que volver a teclearlo, no un cambio silencioso de un
valor de negocio), pero es el mismo mecanismo de fondo y debería corregirse con el mismo patrón en
un trabajo aparte, antes de que alguno de esos formularios incorpore un campo de selección.

### `logs/upload.txt`, conectado en RF-14

`infrastructure/logging/logUpload.ts` expone `registrarIntentoSubida()`, preparado en RF-13 y
conectado por primera vez en RF-14 desde `POST /api/notificador/cargas`. A diferencia de
`errores.txt`/`auditoria.txt` (rotación a cargo del sistema operativo), usa la rotación **nativa**
de Winston (`maxsize`/`maxFiles`/`tailable: true`): el archivo activo siempre se llama `upload.txt`
y los archivados quedan como `upload1.txt`, `upload2.txt`, etc.

## Subida y validación de archivos de reporte (RF-14)

Cierra el alcance que RF-13 dejó explícito como pendiente: la subida real de un archivo por un
NOTIFICADOR_RPC y su validación contra el formato asignado. Módulo nuevo `modules/reporte-excel/`,
mismo patrón onion que `formatos-excel/`.

### Motor de validación: acumula errores, no falla al primero

`ValidarYCargarArchivo` (el caso de uso central) recorre estructura → celdas → reglas sin cortar en
el primer error encontrado, porque el requerimiento pide un resumen completo por fila, no un
fail-fast. Dos topes de defensa, ambos realmente aplicados (no solo mencionados):
`TOPE_FILAS_DATOS` (20.000) acota cuántas filas de datos se procesan, y `TOPE_ERRORES_PERSISTIDOS`
(500) acota cuántas filas de `ErrorCargaArchivo` se insertan por carga — si se excede, la función
`acotarErrores()` corta ahí y agrega una fila resumen (`"... y N errores más"`, `numeroFila: 0`).
`CargaArchivo.cantidadErrores` guarda el conteo **real** de errores encontrados (`errores.length`),
no el acotado, para no contradecir ese mensaje.

Toda columna declarada en el formato que falte en el archivo es `COLUMNA_FALTANTE` — **sin
importar si es requerida o no**: la estructura del archivo (qué columnas trae) es una validación
distinta de si una celda puede venir vacía. Columnas del archivo no declaradas en el formato son
`COLUMNA_INESPERADA` (decisión explícita del usuario: no se ignoran en silencio). Ambos son errores
de archivo completo (`numeroFila: 0`), no de una fila puntual.

### Convención chilena de formato de celda (primera vez definida en el proyecto)

`infrastructure/validacion/ValidadoresTipoDato.ts` es la primera vez que el proyecto valida un
*valor* real contra `TipoDatoColumna` (RF-13 solo validaba la etiqueta del tipo, nunca un dato).
Convención fijada por decisión explícita del usuario, sin antecedente previo que seguir: decimal con
coma o punto; fecha en texto `DD-MM-AAAA` o `DD/MM/AAAA`; fecha y hora en texto
`DD-MM-AAAA HH:mm[:ss]` (con `/` o `T` como separadores alternativos de fecha/hora); booleano acepta
`SI/NO`, `VERDADERO/FALSO`, `1/0` (case-insensitive). RUT reutiliza `esRutValido()` de
`shared/utils/rut.ts` (mismo validador que el login); EMAIL usa `z.email()` de Zod.

**Limitación de origen, no de código:** en `.xlsx`, `exceljs` entrega siempre un `Date` nativo para
una celda de fecha, tenga o no componente de hora en Excel — a nivel de valor no hay forma de
distinguir "solo fecha" de "fecha y hora", así que `FECHA` y `FECHA_HORA` aceptan lo mismo en xlsx.
La distinción real de formato solo existe en `.csv`, donde el texto sí declara si trae hora.

### El evaluador de reglas reutiliza la configuración de RF-13 tal cual quedó persistida

`EvaluadorReglasValidacion.cumpleReglaValidacion()` no reinterpreta nada de `reglasValidacion`: lee
las columnas por **nombre** (mismo criterio ya documentado en RF-13 — sin FK, porque
`actualizar()` regenera ids en cada edición) y aplica `ALGUNA_COLUMNA_CON_VALOR` contra el `Record`
de la fila ya leída por `LectorArchivoReporte`. Es el "evaluador contra un archivo real" que RF-13
dejó explícitamente pendiente.

### Perfil `REVISOR_REPOSITORIO`: misma receta que RF-12, no una excepción

El tercer perfil del sistema (tras ADMIN y NOTIFICADOR_RPC) se agregó con el mismo mecanismo exacto
de RF-09 (INSERT de datos en `perfil`, sin migración de esquema) y la misma receta de área top-level
de RF-12: `esPerfilRevisorRepositorio()` en `modules/perfiles/domain/entities/Perfil.ts`, prefijo
`/revisor/:path*` agregado al `matcher` de `src/proxy.ts` con chequeo **positivo** (no una lista de
exclusiones), y una rama nueva en el switch de `app/inicio/page.tsx`. `/revisor` es hoy solo lectura
(bienvenida + listado de cargas aprobadas), sin mutaciones propias.

### Ownership y filtro de estado, aplicados en el `WHERE`, no después

`formatoExcelId` del cliente se valida contra `FormatoExcelRepository.estaAsignadoYActivo()` antes
de leer el archivo (nunca se confía en el valor recibido — cierra la ventana de carrera de un
formato desasignado entre que el notificador abre el selector y envía el archivo, tratándola igual
que "nunca estuvo asignado"). Los endpoints de `/api/notificador/cargas/*` filtran siempre por
`usuarioId` de sesión. `listarAprobadas()` y `obtenerParaDescarga()` filtran `estado: "APROBADA"`
en el `WHERE` de Prisma (no en JS después de traer la fila) — mismo criterio que ya rige para
`activo` en `formatos-excel`. Los casos de uso de detalle (`ObtenerCargaPropia`/
`ObtenerCargaAprobada`) siguen el mismo criterio a través de
`CargaArchivoRepository.obtenerPropiaPorId(id, usuarioId)`/`obtenerAprobadaPorId(id)`: el filtro
de ownership/estado va en el `WHERE` del `findFirst`, no como un `if` en JS después de traer la
fila por PK (corrección aplicada tras la revisión de código de RF-14, para que el propio
repositorio garantice la propiedad y no dependa de que cada caso de uso la recuerde aplicar).

### Visto bueno: transición de estado única y sin endpoint de reversión

`CargaArchivo.estado` solo transiciona `CON_ERRORES`/`PENDIENTE_VISTO_BUENO` (según si
`cantidadErrores > 0`) → `APROBADA`, nunca al revés: no existe endpoint para deshacer un visto
bueno ya dado (decisión explícita del usuario). Solo el mismo `usuarioId` que subió el archivo puede
confirmarlo — no cualquier notificador con el mismo formato asignado.

### Patrón de errores de caso de uso: unión discriminada, no `domain/errors/`

A diferencia de `modules/formatos-excel` (que sí usa clases de error como `FormatoDuplicadoError`),
los casos de uso de `reporte-excel` devuelven `{ ok: true, ... } | { ok: false, motivo: "..." }`,
seguiendo el patrón ya establecido en `modules/usuarios` (`CambiarEstadoUsuario`,
`ActualizarUsuario`) para casos donde el rechazo es una rama de negocio esperada (formato no
asignado, carga con errores, carga ya aprobada, carga inexistente/ajena) y no una condición
verdaderamente excepcional. Ambos patrones conviven en el proyecto; la elección depende del módulo
donde ya se estableció, no de una regla nueva.

### Deuda técnica explícita: binario sin cifrado adicional

`carga_archivo.contenidoArchivo` se persiste igual que `formato_excel.contenidoPlantilla` de RF-13
(un `Bytes` sin cifrado a nivel de aplicación). A diferencia de esa plantilla de ejemplo, este
archivo puede contener datos clínicos reales de pacientes (el sistema es un Registro Poblacional de
Cáncer) — decisión explícita del usuario de no bloquear esta entrega por eso, documentada también en
`docs/requerimientos.md`, pendiente de una definición de infraestructura futura (cifrado en reposo,
retención/purga).

## Ventanas de tiempo para carga de archivos (RF-15)

Módulo nuevo `modules/ventanas-carga/`, mismo patrón onion que `formatos-excel/`/`reporte-excel/`.

### Estado calculado, nunca persistido — mismo precedente que `TokenRecuperacion`

`VentanaCarga` no tiene columna `estado`. `estaAbierta(ventana, ahora)`
(`domain/entities/VentanaCarga.ts`) compara `fechaApertura <= ahora && ahora <= fechaVencimiento`
en cada lectura, recibiendo siempre `ahora` como parámetro desde la aplicación — igual que
`TokenRecuperacion.expiraEn` en RF-10. Sin esto haría falta un job programado para "cerrar" la
ventana al vencer, y el proyecto no tiene infraestructura de tareas en segundo plano.

### `fechaVencimiento` se normaliza al final del día — el error real que motivó esta regla

Un `<input type="date">` entrega `"AAAA-MM-DD"`, y `z.coerce.date()` lo interpreta como
**medianoche UTC** de ese día, no como "todo ese día". Sin corregirlo, una ventana creada con
vencimiento "31-12-2026" se cerraba a las 00:00 UTC del propio 31 — hasta ~24h antes de lo que
cualquier persona esperaría al leer esa fecha, y además podía rechazar como fuera de rango una
fila con `FECHA_HORA` del último día legítimo de la ventana (`EvaluadorReglasValidacion.ts`
compara contra el instante exacto, no contra el día calendario). Detectado por el agente `revisor`
en la revisión de código, con severidad "importante": no bloquea el build ni es un problema de
seguridad, pero contradice el requerimiento ("la ventana debe cerrarse cuando se cumpla la fecha
de vencimiento", que implica cubrir ese día completo) y puede rechazar datos clínicos válidos.

**Fix:** `fechaVencimientoVentanaCargaSchema` (`schemas/ventana-carga.schema.ts`) aplica un
`.transform()` que ancla la hora a `23:59:59.999` antes de que el valor llegue a
`validarRangoVentana` (el chequeo de rango ya ve la fecha normalizada) o se persista. Se aplica
tanto en creación como en edición. Efecto colateral aceptado: una ventana de un solo día
(`fechaApertura` == `fechaVencimiento` en el mismo `<input>`) ahora es válida, porque el
vencimiento normalizado queda estrictamente después de la apertura a medianoche.

**Nota para el resto del código:** `parsearFecha()` en
`modules/reporte-excel/infrastructure/validacion/ValidadoresTipoDato.ts` sigue el mismo convenio
UTC "de pared" al leer celdas de fecha del archivo, así que la comparación de
`FECHA_DENTRO_DE_VENTANA_VIGENTE` compara dos valores construidos con el mismo criterio de zona.
La UI usa `formatearFechaCalendario()` (`shared/utils/fecha.ts`, `timeZone: "UTC"`) para mostrar
estas fechas — usar el formateador de hora de Chile (`formatearFecha`/`formatearFechaHora`,
pensados para timestamps reales como `createdAt`) sobre un campo de este tipo corre la fecha un
día hacia atrás en pantalla, fue el primer bug encontrado al verificar esta pantalla en navegador.

### Como mucho una ventana por año y formato, pero varias pueden estar abiertas a la vez

`(anio, formatoExcelId)` es único mientras la ventana no esté eliminada (índice parcial
`WHERE "eliminadaEn" IS NULL`, agregado a mano en la migración — Prisma no expresa un índice único
parcial en su DSL). Corrección posterior a la ampliación de RF-15: originalmente la unicidad era
solo sobre `anio`; al reemplazar `tipoArchivo` (enum EXCEL/CSV) por `formatoExcelId` (referencia a
un `FormatoExcel` concreto), la unicidad pasó a ser "un año, un formato", para permitir que el
mismo año tenga ventanas distintas para formatos distintos. Se protege en dos capas, mismo
criterio que `CrearUsuario`/`PrismaFormatoExcelRepository`: `crearVentanaCarga()` comprueba
`obtenerPorAnioYFormato()` antes de escribir, y `PrismaVentanaCargaRepository.crear()` captura
`P2002` y lo traduce a `VentanaCargaDuplicadaError`, cerrando la ventana de carrera de dos
administradores creando la misma ventana a la vez. No hay restricción de "una sola ventana vigente
a la vez": el requerimiento necesita poder reportar datos de años distintos (o formatos distintos)
en paralelo (p. ej. corregir datos del año anterior mientras ya está abierto el período actual).

`anio` es inmutable una vez creada la ventana (no se expone en el endpoint de edición); las
`fechaApertura`/`fechaVencimiento` y el `formatoExcelId` sí se pueden cambiar, y **siempre**,
incluso con cargas ya asociadas a esa ventana — decisión explícita del usuario, que corrigió una
propuesta inicial de restringir la edición a ventanas sin cargas. Ni `EditarVentanaCarga` ni el
Route Handler ni `PrismaVentanaCargaRepository.actualizar` comprueban cargas existentes. Una
`CargaArchivo` ya subida conserva su propio `formatoExcelId`, no derivado de la ventana, así que
cambiar el formato de una ventana no reescribe el de las cargas ya asociadas a ella.

### El notificador elige el año al subir; el servidor nunca confía en esa elección

(Sección superada por la ampliación "Tipo de archivo por ventana y publicación explícita" más
abajo: el `<select>` de año descrito aquí ya no existe, reemplazado por una tarjeta por
combinación formato/ventana. Se conserva este párrafo por su explicación de por qué el servidor
nunca confía en el año elegido por el cliente, que sigue vigente.) `CargaArchivo` gana
`ventanaCargaId`: cada carga queda asociada al año efectivamente usado. `ValidarYCargarArchivo`
resuelve la ventana de ese año y verifica que esté abierta **antes de leer el archivo** (mismo
criterio "barato primero" que el resto de RF-13/14), rechazando con `SIN_VENTANA_ABIERTA` (misma
unión discriminada que ya usa `FORMATO_NO_ASIGNADO`) si no existe o ya cerró — sin importar lo que
el cliente mostrara al momento de cargar la página. Verificado con `curl`: un `anio` inexistente o
el de una ventana recién cerrada devuelven 400 igual, nunca se confía en el valor recibido.

**Sin ninguna combinación disponible, solo se oculta la subida — no el historial.** Si el arreglo
de combinaciones (formato, ventana) viene vacío, `panel-carga-archivo.tsx` reemplaza únicamente la
sub-sección de subida por un mensaje explicativo genérico; la sección "Mis cargas" (incluida la
acción "Dar visto bueno" sobre una carga ya subida) sigue siempre visible y funcional, porque
aprobar una carga existente no es una operación de subida y no depende de que exista una ventana
vigente. Una primera versión ocultaba todo el panel con un `return` temprano — corregido durante
la verificación en navegador antes de pasar a revisión de código.

### Nuevo tipo de regla de validación: reutiliza el motor de RF-13/14, no un concepto paralelo

`FECHA_DENTRO_DE_VENTANA_VIGENTE` se agrega a `TipoReglaValidacionFormatoExcel` con el mismo
mecanismo que `ALGUNA_COLUMNA_CON_VALOR`: el ADMIN la configura por formato, referenciando una
columna por **nombre** (no por FK, mismo motivo ya documentado para las demás reglas). A
diferencia de `ALGUNA_COLUMNA_CON_VALOR` (exactamente el conjunto de columnas de la regla, mínimo
2), esta exige **exactamente 1** columna y que su `tipoDato` declarado sea `FECHA`/`FECHA_HORA`
(`formato-excel.schema.ts`, rama nueva en el mismo `superRefine` que ya validaba las referencias
de reglas). `EvaluadorReglasValidacion.cumpleReglaValidacion()` gana un parámetro de contexto
(`{ ventana }`) que las demás reglas no necesitan, porque el rango contra el que se compara viene
de fuera de la fila y de la propia regla — la ventana la resuelve `ValidarYCargarArchivo` una sola
vez por carga completa, no por fila. Si la celda no es una fecha válida, la regla no reporta nada
(ese caso ya lo cubre `TIPO_DATO_INVALIDO` en el paso anterior de la misma validación por celda) —
evita duplicar el mismo error dos veces sobre la misma celda.

### Primera capacidad de escritura de REVISOR_REPOSITORIO

Hasta RF-15, `/revisor` era 100% solo lectura (bienvenida + listado de cargas aprobadas, RF-14).
Los 4 endpoints de `ventanas-carga` usan el mismo guard `exigirAdminORevisor()` ya existente
(compartido con `/api/dashboard/cargas/*`), así que ADMIN y REVISOR_REPOSITORIO pueden ambos crear
y editar ventanas — decisión explícita del usuario, tal como pide el texto del requerimiento
("el admin y perfil revisor pueden crear una ventana... puede abrirse por el perfil admin y
revisor"). La UI (`shared/components/{ListadoVentanasCarga,TablaVentanasCarga}.tsx`) es el mismo
componente compartido entre `/dashboard/ventanas-carga` y `/revisor/ventanas-carga`, mismo patrón
ya usado para `TablaCargasAprobadas` entre esas dos áreas.

### Sin índices nuevos, salvo el índice único parcial de `anio`

Como mucho unas pocas filas por año, el volumen nunca justifica un índice (ver la deuda técnica ya
documentada sobre índices en `docs/requerimientos.md`, que a diferencia de `carga_archivo` no
aplica aquí). La única excepción es el índice único parcial de `anio` (ver más abajo), necesario
para la corrección semántica de la unicidad, no por rendimiento.

### Eliminar una ventana: física si no tiene cargas, lógica si ya tiene alguna — decidido por la
### propia base de datos, no por un conteo previo

Agregado después de la entrega inicial de RF-15, a pedido explícito del usuario ("los perfiles
admin y revisor al crear una ventana también pueden eliminarla"). Dos decisiones de diseño nuevas
que no estaban en el alcance original:

**Asimetría de permisos, la única en todo RF-15.** ADMIN puede eliminar cualquier ventana;
REVISOR_REPOSITORIO solo las que él mismo creó (`EliminarVentanaCarga.ts` compara
`ventana.creadoPorId` contra el actor solo si `!esPerfilAdministrador(actor.perfil)`). Crear y
editar fechas siguen sin restricción de ownership entre ambos perfiles — es deliberado que solo
eliminar la tenga, según lo pidió el usuario.

**Hard vs. soft decidido por el `ON DELETE RESTRICT`, no por contar cargas antes.**
`PrismaVentanaCargaRepository.eliminar()` intenta directamente `prisma.ventanaCarga.delete()`. Si
la ventana no tiene ninguna `CargaArchivo` apuntándole, el `DELETE` físico simplemente funciona. Si
tiene alguna, el `ON DELETE RESTRICT` de `CargaArchivo.ventanaCargaId` (ya existente, pensado
originalmente solo como defensa en profundidad) lo rechaza con `P2003`, y el repositorio traduce
ese rechazo en una eliminación **lógica** (`eliminadaEn`/`eliminadaPorId`) en vez de propagar el
error. La alternativa —contar cargas asociadas antes de decidir qué tipo de `DELETE` intentar—
tendría una ventana de carrera real: una carga podría insertarse entre el conteo y el `DELETE`.
Dejar que la propia restricción de integridad referencial decida evita esa ventana por
construcción, no por disciplina de código.

**`anio` deja de ser `@unique` de columna simple.** Una ventana eliminada lógicamente conserva su
fila (para no perder a qué ventana perteneció una carga ya aprobada), pero su año debe poder
reutilizarse para crear una ventana nueva y correcta. Con un `@unique` de columna completa eso
sería imposible: el año quedaría bloqueado para siempre por la fila eliminada. La solución es un
**índice único parcial** (`CREATE UNIQUE INDEX ... ON "ventana_carga"("anio") WHERE "eliminadaEn"
IS NULL`), agregado a mano en la migración porque Prisma no expresa un índice único condicional en
su schema DSL — mismo mecanismo ya usado en RF-09/RF-14 para agregar SQL fuera del diff generado.
`obtenerPorAnio()` (usada tanto para el chequeo de unicidad al crear como para resolver la ventana
elegida por el notificador al subir) filtra `eliminadaEn: null` en el `WHERE` de Prisma para que el
código de aplicación vea exactamente la misma noción de "año disponible" que impone el índice.

**Una ventana eliminada nunca vuelve a habilitar subidas ni se puede volver a editar.**
`estaAbierta()` ahora exige también `eliminadaEn === null`, sin importar las fechas — necesario
porque `listar()` sigue devolviendo las ventanas eliminadas (para trazabilidad en la tabla de
`/dashboard`/`/revisor`, con badge "Eliminada" y sin acciones disponibles) y su cálculo de
`abierta` no debe mentir. `EditarVentanaCarga` rechaza con un motivo nuevo
(`VENTANA_ELIMINADA`, 409) si la ventana ya fue eliminada: no tiene sentido cambiarle fechas/tipo a
un recurso dado de baja.

**Sin botón de eliminar cuando el servidor lo rechazaría de todas formas.**
`ListadoVentanasCarga` (Server Component) resuelve la sesión actual y pasa `actorId`/`esAdmin` a
`TablaVentanasCarga`, que oculta el botón "Eliminar" en las filas que un REVISOR_REPOSITORIO no
creó. Es solo UX, no la autorización real: `EliminarVentanaCarga.ts` aplica la misma regla
igualmente, así que ocultar el botón no reemplaza el guard — un intento directo por API contra una
ventana ajena sigue devolviendo 403.

### Formato de archivo por ventana y publicación explícita (ampliación de RF-15)

Agregado después de la entrega inicial de RF-15, a pedido explícito del usuario: cada ventana
declara qué formato de archivo acepta y nace como borrador, sin ser visible para el notificador
hasta que un ADMIN/REVISOR_REPOSITORIO la publica explícitamente. La primera versión de esta
ampliación usaba un enum genérico `TipoArchivo` (`EXCEL`/`CSV`); una corrección posterior lo
reemplazó por una referencia directa a un `FormatoExcel` concreto (`formatoExcelId`), documentada
más abajo.

**`VentanaCarga.formatoExcelId` reemplaza al enum `TipoArchivo` (corrección posterior).** Un tipo
genérico EXCEL/CSV no bastaba: el formato real trae las reglas de validación y el número de
columnas requeridas/opcionales, que un simple tipo de archivo no expresa. `VentanaCarga`
(`modules/ventanas-carga/domain/entities/VentanaCarga.ts`) referencia ahora un `FormatoExcel`
concreto mediante `formatoExcelId` (relación 1:1 desde `VentanaCarga` hacia `FormatoExcel`: una
ventana referencia exactamente un formato, pero varias ventanas de años distintos pueden apuntar
al mismo formato), con `formatoExcelNombre` denormalizado vía join, mismo criterio que
`creadoPorNombre`/`eliminadaPorNombre`. `formatoExcelId` lo elige el ADMIN/REVISOR al crear la
ventana y SÍ es editable después, en el mismo PUT que las fechas
(`schemas/ventana-carga.schema.ts#editarVentanaCargaSchema`,
`application/use-cases/EditarVentanaCarga.ts`): a diferencia de `anio`, no hay ninguna razón de
negocio para congelarlo. Al editar, si el `formatoExcelId` recibido es el mismo que la ventana ya
tenía, no se revalida que esté activo (conserva su valor actual aunque haya sido dado de baja
mientras tanto — mismo criterio ya usado en `modules/usuarios/` para perfiles/formatos); si cambia
a otro, ese otro debe ser un formato activo (`FormatoExcelRepository.existeActivo()`), o se
rechaza con el motivo `FORMATO_INVALIDO` (400). `FormatoExcel.tipoArchivo` (el campo derivado de la
plantilla) se mantiene intacto en `modules/formatos-excel/` como dato informativo del mantenedor de
formatos; solo perdió a `VentanaCarga` como consumidor de matching.

**Publicación: borrador por defecto, exclusión real en el `WHERE`, no en la UI.** `publicada`
nace en `false` (`@default(false)`) y solo cambia con su propio endpoint
`PATCH /api/dashboard/ventanas-carga/[id]/publicacion`
(`application/use-cases/CambiarPublicacionVentanaCarga.ts`), nunca junto a fechas/formato — mismo
criterio de "un concepto, un endpoint" que ya separa eliminar de editar. Es simétrico entre ADMIN y
REVISOR_REPOSITORIO (sin la asimetría de ownership que sí tiene eliminar), y se rechaza con
`VENTANA_ELIMINADA` (409) sobre una ventana ya dada de baja. El requisito explícito del usuario
("el notificador no debe ver ventanas no publicadas") se resuelve con
`VentanaCargaRepository.listarDisponibles(ahora)`
(`infrastructure/repositories/PrismaVentanaCargaRepository.ts`), que filtra `publicada: true` en el
propio `WHERE` de Prisma junto con `eliminadaEn: null` y el rango de fechas — reemplaza a
`listarAniosConVentanaVigente`/`ListarAniosDisponiblesParaCarga` (eliminados), que no conocían la
publicación. `disponibleParaNotificador()` (`domain/entities/VentanaCarga.ts`) expresa la misma
regla a nivel de dominio (`estaAbierta() && publicada`), pero el camino real que protege al
notificador es el filtro en la consulta, no esta función — igual que `estaAbierta()` ya documentaba
para `eliminadaEn`.

**El notificador ya no elige año ni formato desde un `<select>`.** A pedido explícito del usuario
("se deben quitar los select... cada tipo de formato y año se muestran en secciones separadas"),
`app/notificador/page.tsx` cruza `listarAsignadosAUsuario()` (formatos del notificador) contra
`listarVentanasDisponiblesParaNotificador()` (ventanas publicadas y abiertas) y arma un arreglo de
combinaciones `{ formatoExcelId, formatoNombre, anio, ventanaCargaId }`, una por cada par cuyo
`formatoExcelId` coincide exactamente (`ventana.formatoExcelId === formato.id`; antes de la
corrección era una comparación de `tipoArchivo`, más laxa). `panel-carga-archivo.tsx` renderiza
una tarjeta (`TarjetaCargaArchivo`) por combinación, cada una con su propio estado de
archivo/subida/error/resultado — el estado de subida ya no es único a nivel de todo el panel. El
resultado de cada subida (necesario para poder actualizar su badge tras "Dar visto bueno") vive en
el panel padre, indexado por clave `formatoExcelId::ventanaCargaId`, no dentro de cada tarjeta:
`confirmarVistoBueno()` necesita poder tocar el resultado de la tarjeta correspondiente sin que las
tarjetas se suscriban a un efecto.

**El servidor revalida la combinación año+formato en una sola consulta, nunca confía en que el
cliente solo ofrezca combinaciones válidas.** `ValidarYCargarArchivo`
(`modules/reporte-excel/application/use-cases/`) resuelve la ventana con
`VentanaCargaRepository.obtenerPorAnioYFormato(anio, formatoExcelId)` en vez de `obtenerPorAnio`:
esa única consulta fusiona lo que antes eran dos pasos (resolver la ventana del año, comprobar que
su `tipoArchivo` coincidiera con el del formato elegido). Si no existe una ventana para ese año Y
ese formato exacto, es `SIN_VENTANA_ABIERTA` — ya no existe el motivo `TIPO_ARCHIVO_NO_COINCIDE` ni
su respuesta HTTP dedicada, porque la consulta ya filtra por id exacto y no hay nada que distinguir
entre "no existe" y "no coincide". Después de resolver la ventana, sigue el chequeo de
`VENTANA_NO_PUBLICADA` (barato primero, antes de leer el archivo con `exceljs`, mismo criterio que
el resto de RF-13/14/15): se mapea en `app/api/notificador/cargas/route.ts` a la MISMA respuesta
HTTP genérica que `SIN_VENTANA_ABIERTA` (`respuestaSinVentanaAbierta()`) — no debe revelarse que
existe un borrador, mismo criterio que ya distingue "formato nunca asignado" de "formato dado de
baja" bajo una sola respuesta.

**Migración con backfill manual, mismo mecanismo ya usado en RF-09/RF-14/RF-15.** La migración
`add_tipo_archivo_y_publicacion` agregó `tipoArchivo` a `formato_excel` (backfill determinista
desde el `tipoContenidoPlantilla` real ya persistido) y a `ventana_carga` (backfill arbitrario a
`EXCEL`) y `publicada` a `ventana_carga` (`DEFAULT false`, sin backfill ambiguo). La migración
posterior `ventana_carga_formato_excel` (corrección de esta sección) agregó `formatoExcelId` a
`ventana_carga` (nullable primero, FK a `formato_excel` con `ON DELETE RESTRICT`), hizo el backfill
dirigido de la única fila real existente en la base de desarrollo (confirmado con una consulta
previa: una sola ventana, año 2026, `tipoArchivo = EXCEL`) hacia el formato "VARIABLES ENVIO DE
HEMATOLOGIA" — el único formato con cargas reales asociadas a esa ventana —, fijó `NOT NULL`,
reemplazó el índice único parcial de `anio` por uno sobre `(anio, formatoExcelId)` (mismo `WHERE
"eliminadaEn" IS NULL`) y finalmente eliminó la columna `tipoArchivo` de `ventana_carga`. Todas las
columnas nacen `NULLABLE` (o con default) y se fijan `NOT NULL` después del `UPDATE`, porque Prisma
no genera el backfill automáticamente cuando la tabla ya tiene filas.
