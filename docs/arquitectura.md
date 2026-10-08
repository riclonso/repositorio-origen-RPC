# Arquitectura

Última actualización: 2026-10-07 (RF-36: plazo de reemplazo configurable por ventana y fórmula única; RF-37: perfil Bioestadística con archivos en disco, lectura en streaming y procesamiento asíncrono; antes, 2026-10-02: RF-33: la autorización de reemplazo se consume al finalizar, `resolverAutorizacionReemplazo`, "APROBADA vigente" excluye las superadas, índice único parcial de pendientes finalizadas; antes, 2026-10-01: RF-32: tipos de regla `CONTENIDO_HTML` y `FILA_VACIA`, `domain/reglas/filasArchivo.ts`; RF-31: módulo `mensajeria/`, guard `exigirRevisor()`, prefijo `/api/revisor/**`, hooks en `shared/hooks/`; antes, 2026-09-30: plantilla descargable generada desde la BD para todos los perfiles, `GeneradorPlantillaExcelJs`; RF-30: `usuario.establecimientoId`, regla compartida `validarEstablecimientoUsuario` en `usuarios/application/`; RF-29: eliminación física en `tipoEstablecimiento/`; RF-28: módulo `comunas/`; RF-27: módulo `provincias/`; RF-26: módulo `regiones/`; antes, 2026-09-23: RF-14 corregido: fin de la autoaprobación del notificador, aprobación/rechazo por ADMIN/REVISOR_REPOSITORIO)

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
│   ├── usuarios/           — mismo patrón; mantenedor de usuarios (RF-06, implementado). Desde
│   │                         RF-30 los casos de uso de alta/edición reciben además la INTERFAZ
│   │                         `EstablecimientoRepository` (application/validarEstablecimientoUsuario.ts,
│   │                         errors/EstablecimientoInvalidoError.ts)
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
│   │   ├── domain/         — entities/CargaArchivo.ts, entities/CargaArchivoRechazo.ts (rechazo
│   │   │                     unilateral de una carga APROBADA + reapertura individual, RF-20),
│   │   │                     repositories/
│   │   ├── application/    — use-cases/ (ValidarYCargarArchivo, DarVistoBueno, RechazarCarga,
│   │   │                     ListarCargasRechazadas, ListarReaperturasVigentesPropias,
│   │   │                     Listar/Obtener*). `ValidarYCargarArchivo`/`DarVistoBueno` reciben
│   │   │                     `repositorioSolicitudesReemplazo` inyectado (interfaz de
│   │   │                     `modules/solicitudes-reemplazo/domain/repositories/`, RF-19) — un
│   │   │                     módulo puede depender de la INTERFAZ de otro, nunca de su
│   │   │                     implementación concreta.
│   │   ├── infrastructure/ — repositories/PrismaCargaArchivoRepository.ts (`darVistoBueno`/
│   │   │                     `rechazar` son transacciones interactivas de Prisma con `timeout`
│   │   │                     explícito — ver RF-19/RF-20 más abajo),
│   │   │                     validacion/ (ValidadoresTipoDato, EvaluadorReglasValidacion),
│   │   │                     lectura-archivo/LectorArchivoReporteExcelJs.ts,
│   │   │                     email/ (RechazoCargaMailer.ts, VistoBuenoCargaMailer.ts — RF-20),
│   │   │                     auditoria/
│   │   └── schemas/        — reporte-excel.schema.ts
│   ├── ventanas-carga/     — ventanas de tiempo para carga de archivos (RF-15, implementado)
│   │   ├── domain/         — entities/VentanaCarga.ts (incluye estaAbierta, sin estado persistido;
│   │   │                     referencia un `FormatoExcel` concreto vía `formatoExcelId`, no un
│   │   │                     `TipoArchivo` genérico), repositories/,
│   │   │                     errors/VentanaCargaDuplicadaError.ts,
│   │   │                     errors/FormatoInvalidoVentanaCargaError.ts
│   │   ├── application/    — use-cases/ (Crear/EditarFechas/Listar/ListarAniosDisponibles/Obtener)
│   │   ├── infrastructure/ — repositories/PrismaVentanaCargaRepository.ts, auditoria/
│   │   └── schemas/        — ventana-carga.schema.ts (anioVentanaCargaSchema reutilizado por
│   │                         `reporte-excel/schemas/reporte-excel.schema.ts`, para no duplicar rango)
│   ├── tipoEstablecimiento/ — catálogo de tipos de establecimiento (baja lógica con `activo`; desde
│   │                         RF-29 también eliminación física si ningún establecimiento lo usa: la
│   │                         decide la FK `Restrict`, P2003 → 409; `listarConUso()` con `_count` solo
│   │                         para el mantenedor, `listar()` sigue sirviendo a los selects)
│   ├── regiones/           — catálogo de Regiones (RF-26, implementado; solo ADMIN). Mismo patrón
│   │                         de capas: entities/Region.ts, errors/ (RegionDuplicadaError con el
│   │                         campo en conflicto, RegionEnUsoError), use-cases/ (Listar/Obtener/
│   │                         Crear/Actualizar/Eliminar), PrismaRegionRepository.ts, auditoria/
│   │                         auditarRegion.ts, schemas/region.schema.ts. `provincia` la referencia
│   │                         con FK `Restrict` (P2003 → 409 REGION_EN_USO); `tieneProvincias()`
│   │                         bloquea cambiar el código de una región con provincias
│   ├── provincias/         — catálogo de Provincias por región (RF-27, solo ADMIN). Mismo patrón que
│   │                         `regiones/`; los casos de uso de escritura reciben además la INTERFAZ
│   │                         `RegionRepository` (validarRegionDeProvincia.ts: región existente y
│   │                         prefijo del código = código de la región). `comuna` la referencia con
│   │                         FK `Restrict`; `tieneComunas()` bloquea cambiar su código
│   ├── comunas/            — catálogo de Comunas por provincia (RF-28, solo ADMIN). Mismo patrón;
│   │                         escritura recibe la INTERFAZ `ProvinciaRepository`
│   │                         (validarProvinciaDeComuna.ts). Sin `regionId` propio: la región se
│   │                         deriva por la provincia en el `select` anidado del listado
│   ├── bioestadistica/     — perfil Bioestadística (RF-37): archivos de Defunciones y Egresos por
│   │                         año. entities/ (CargaBioestadistica, SolicitudReemplazoBioestadistica,
│   │                         DisponibilidadAnio, EstadoTarjetaBioestadistica, ValidacionEncabezados),
│   │                         ports.ts (AlmacenArchivos, LectorArchivoLibreStreaming, mailer),
│   │                         use-cases/ (RecibirArchivo…, ProcesarCarga…, ObtenerPanel…, Listar…,
│   │                         ObtenerArchivo…, Solicitar/RevisarSolicitudReemplazo…,
│   │                         MarcarProcesamientosHuerfanosComoFallidos), infrastructure/
│   │                         (almacenamiento/AlmacenArchivosDisco.ts, lectura-archivo/,
│   │                         concurrencia/LimitadorConcurrenciaMemoria.ts, arranque/, repositories/,
│   │                         email/, auditoria/). Lee las ventanas vía la INTERFAZ `VentanaCargaRepository`
│   ├── mensajeria/         — mensajes revisor ↔ notificador sobre cargas (RF-31). entities/
│   │                         MensajeCarga.ts, repositories/MensajeCargaRepository.ts, ports.ts
│   │                         (EnviadorAvisoMensajeNuevo), use-cases/ (EnviarMensajeRevisor,
│   │                         ResponderMensajeNotificador, ListarConversacionesVentana,
│   │                         ObtenerHiloVentana, MarcarMensajesLeidos,
│   │                         ObtenerResumenMensajesPorVentana, AvisarMensajeNuevo),
│   │                         PrismaMensajeCargaRepository.ts, email/AvisoMensajeMailer.ts,
│   │                         auditoria/auditarMensajeCarga.ts, schemas/ (mensaje.schema.ts,
│   │                         vistas-mensajeria.ts: DTOs compartidos por API y componentes). Lee la
│   │                         carga vía la INTERFAZ `CargaArchivoRepository` de `reporte-excel`
│   └── solicitudes-reemplazo/ — autoriza el reemplazo de una carga ya APROBADA (RF-19), ampliado
│       │                     (RF-22) a también cubrir una carga PENDIENTE_VISTO_BUENO ya finalizada
│       │                     y sin decidir (ver `origen` abajo)
│       ├── domain/         — entities/SolicitudReemplazoCarga.ts (estado + `origen`:
│       │                     `CARGA_APROBADA` | `CARGA_PENDIENTE_DECISION`, resuelto siempre en
│       │                     servidor, nunca recibido del cliente; `solicitudUtilizable`/
│       │                     `solicitudVencida`, vigencia calculada en lectura (RF-36: `diasVigencia`
│       │                     copiado de la ventana al aprobar; antes, 5 días fijos) contra un
│       │                     `ahora` recibido, sin cron), errors/SolicitudReemplazoDuplicadaError.ts,
│       │                     repositories/
│       ├── application/    — ports.ts (EnviadorNotificacionSolicitudReemplazo), use-cases/
│       │                     (SolicitarReemplazoCarga, RevisarSolicitudReemplazo,
│       │                     ListarSolicitudesReemplazoPropias/ParaRevision)
│       ├── infrastructure/ — repositories/PrismaSolicitudReemplazoCargaRepository.ts,
│       │                     email/SolicitudReemplazoMailer.ts (plantilla fija, patrón
│       │                     `auth/infrastructure/email/PasswordResetMailer.ts`), auditoria/
│       └── schemas/        — solicitud-reemplazo.schema.ts
├── infrastructure/         — transversal
│   ├── database/prisma.ts, config/env.ts
│   ├── logging/            — logger.ts, auditoria.ts, leerLogs.ts, logUpload.ts (preparado, sin conectar — ver RF-13)
│   ├── email/SmtpMailer.ts
│   ├── hojas-calculo/      — abrirHojaExcelJs.ts; desde RF-37 también leerHojaStreamingExcelJs.ts,
│   │                         leerCsvStreaming.ts y valorCelda.ts (lectura en streaming); desde RF-38
│   │                         escribirHojaStreamingExcelJs.ts, anexarColumnaCsv.ts, flujoWebDesdeNode.ts
│   ├── almacenamiento/     — AlmacenArchivosDisco.ts (RF-38): fábrica compartida por Bioestadística y
│   │                         las cargas del notificador (rutas generadas, prefijo, SHA-256, temporales)
│   ├── concurrencia/       — LimitadorConcurrenciaMemoria.ts (RF-38): turnos, espera máxima, exclusión
│   │                         por clave y liberación al terminar un flujo de respuesta
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
  Desde RF-25, índices `@@index([usuarioId])` en `carga_archivo` y `alerta_notificacion_ventana`
  (ver "Eliminación física solo sin historial").
  Desde RF-30, `usuario.establecimientoId` es FK nullable a `establecimiento.id` (`ON UPDATE CASCADE`,
  `ON DELETE RESTRICT`, `@@index([establecimientoId])`); ver "El usuario pertenece a un
  establecimiento (RF-30)".
  Desde RF-31, `MensajeCarga` (`mensaje_carga`, enum `LadoMensajeCarga`), con FK `Restrict` a
  `carga_archivo`, `ventana_carga` y dos veces a `usuario` (`notificadorId`, `autorId`); ver
  "Mensajería entre revisor y notificador (RF-31)".

## Agentes de desarrollo

Ver [.claude/agents/](../.claude/agents/) (`architecto`, `desarrollador`, `revisor`) y el comando
[/feature](../.claude/commands/feature.md) que los orquesta. El skill `react-doctor`
(`.agents/skills/react-doctor/`) audita componentes React durante la fase de implementación.


## Decisiones de diseño de RF-06 (mantenedor de usuarios)

Registradas aquí porque condicionan cómo se construyen los módulos siguientes.

### Eliminación física solo sin historial (RF-25)

El borrado físico estaba fuera de alcance por trazabilidad; RF-25 lo permite solo cuando no hay
nada que trazar. De las 12 relaciones que referencian a `Usuario` (14 desde RF-31, que agrega los
mensajes escritos y recibidos, ambos de historial; 17 desde RF-37, que agrega las cargas de
Bioestadística y las solicitudes de reemplazo de Bioestadística hechas y revisadas), 10 (hoy 15) son `ON DELETE RESTRICT` y
representan historial (bloquean) y 2 son `CASCADE` y se descartan con la cuenta (tokens de
recuperación y asignaciones de formato; la traza de estas queda en `formatosQuitados` de la
auditoría). La clasificación vive en **una sola fuente**
(`modules/usuarios/infrastructure/repositories/relacionesHistorialUsuario.ts`, fragmentos
`Prisma.sql` con `EXISTS`), que usan tanto el listado como la eliminación; un test de guardia sin BD
(`tests/relaciones-usuario.guard.unit.ts`) compara esa lista con las relaciones del `model Usuario`
y falla si aparece una sin clasificar (la guardia compara nombres, no el SQL de cada `EXISTS`).

**Por qué el indicador va en el SQL crudo y no en `_count`:** el listado usa `$queryRaw` (por
`unaccent`), así que `tieneHistorial` se calcula como una columna más del mismo `SELECT` (una
consulta por página, sin N+1). Para que esas subconsultas no escaneen tablas grandes se agregaron
`@@index([usuarioId])` en `carga_archivo` y `alerta_notificacion_ventana`, los primeros índices
explícitos del esquema.

**Atomicidad:** `eliminar(id, actorEsAdmin)` abre una transacción `Serializable` y bloquea la fila
(`SELECT … FOR UPDATE`); sobre esa fila revalida el perfil ADMIN restringido (un REVISOR no puede
borrar a alguien ascendido a ADMIN entre la lectura previa y el borrado), el último ADMIN activo y
el historial. La FK `Restrict` es la defensa final (P2003 → `CON_HISTORIAL`). Con
`@prisma/adapter-pg`, el SQLSTATE 40001 llega como `P2034` en operaciones del cliente pero como
`P2010` (con `meta.driverAdapterError.cause.originalCode = "40001"`) dentro de `$queryRaw`; el
repositorio reconoce ambos. Si tras el conflicto la fila ya no existe, responde 404 en vez de pedir
reintentar.

### El usuario pertenece a un establecimiento (RF-30)

* **Obligatoriedad fuera de la BD.** La columna es nullable porque solo NOTIFICADOR_RPC la exige y
  las cuentas previas no la tienen; la regla se aplica en Zod y se repite en `application/`
  (`validarEstablecimientoUsuario.ts`, usada por alta y edición), mismo criterio que "todo
  NOTIFICADOR_RPC tiene al menos un formato". Se evalúa después de las reglas de autorización y
  anti-autobloqueo.
* **Conservar lo vigente siempre es válido.** Asignar un establecimiento exige que exista y esté
  activo (`existeActivo()`), salvo que sea el que la persona ya tiene: desactivar un establecimiento
  no deja inválidas las cuentas que lo usan (mismo criterio que `conservaSuPerfil`). Por eso el
  select de edición pide `listarOpciones({ soloActivos: true, incluirIds: [vigente] })` en una sola
  consulta (`activo OR id IN …`); sin el vigente, el navegador elegiría otra opción y guardar lo
  cambiaría en silencio. El filtro del listado usa `soloActivos: false`.
* **Dependencia entre módulos por interfaz.** `usuarios/application/` recibe
  `EstablecimientoRepository` (interfaz de `modules/establecimiento/domain/`), nunca su implementación
  Prisma; el Route Handler inyecta `prismaEstablecimientoRepository`.
* **Carrera cerrada por la FK.** Un P2003 contra `usuario_establecimientoId_fkey` se traduce a
  `EstablecimientoInvalidoError` (400). Con `@prisma/adapter-pg` el nombre de la restricción no llega
  en `meta.field_name`/`meta.constraint` sino en `meta.driverAdapterError.cause.constraint`
  (`{ index }` o `{ fields }`); `restriccionFkViolada()` en `PrismaUsuarioRepository` lee ambas formas.
  La rama del establecimiento va antes del fallback a `PerfilInvalidoError`.
* **Listado.** `LEFT JOIN "establecimiento"` en el `$queryRaw` (un JOIN interno haría desaparecer las
  cuentas sin establecimiento); el filtro compara `u."establecimientoId"` directamente, así que el
  conteo no necesita el JOIN. La relación inversa `Establecimiento.usuarios` existe solo porque Prisma
  la exige: nunca usarla con `include` en el listado de establecimientos (N+1).
* **No es historial.** `establecimiento` es una relación de ida (`usuario` apunta a otra tabla), así
  que no se clasifica en `relacionesHistorialUsuario.ts` y no bloquea la eliminación de la cuenta.

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

### Acceso extendido a REVISOR_REPOSITORIO, con restricción `PERFIL_ADMIN_RESTRINGIDO` (posterior, tras RF-15)

A diferencia de `formatos-excel/` y `ventanas-carga/` (donde el cambio de guard fue puramente
mecánico, sin ninguna regla de negocio que distinguiera entre perfiles), abrir el mantenedor de
usuarios a REVISOR_REPOSITORIO sí necesitaba una regla nueva: ninguno de los cinco casos de uso
mutadores (`CrearUsuario`, `ActualizarUsuario`, `CambiarEstadoUsuario`, `RestablecerContrasena` en
`modules/usuarios/`, y `EmitirEnlaceContrasena` en `modules/auth/`, invocado desde los mismos Route
Handlers) impedía que quien tuviera acceso al mantenedor tocara una cuenta ADMIN o se
autopromoviera. Sin esa regla, un REVISOR_REPOSITORIO podría degradar/desactivar/resetear la
contraseña de cualquier ADMIN existente, o asignarse a sí mismo el perfil ADMIN editando su propio
registro.

La regla — "un actor cuyo `perfilCodigo` no es ADMIN no puede crear una cuenta ADMIN, operar sobre
una cuenta cuyo perfil ACTUAL es ADMIN, ni cambiar el perfil de nadie a ADMIN (incluido el suyo
propio)" — se implementó en `application/`, como comprobación adicional en cada uno de los cinco
casos de uso, recibiendo el `perfilCodigo` del actor como parámetro nuevo (mismo criterio que
`actorId` en las reglas anti-autobloqueo ya existentes: si viviera solo en el Route Handler o en la
UI, se podría saltar llamando la API directamente). Se modela como un motivo de rechazo propio,
`PERFIL_ADMIN_RESTRINGIDO`, distinto de `SIN_PERMISO` (que es "no tiene acceso al mantenedor en
absoluto"): éste es "tiene acceso, pero no a esta cuenta o a este valor de perfil". Cada Route
Handler lo traduce a 403 (`respuestaPerfilAdminRestringido()` en `app/api/usuarios/_lib/http.ts`) y
lo audita como `RECHAZADO`, en vez de dejarlo caer en el diccionario `MENSAJES_CONFLICTO` (409) que
ya manejaba `AUTO_OPERACION`/`ULTIMO_ADMIN` — son familias de error distintas (autorización vs.
conflicto de negocio) aunque las dos devuelvan una escritura rechazada.

Los 6 endpoints bajo `app/api/usuarios/` reexportan `exigirAdminORevisor` en vez de `exigirAdmin`
(igual que `formatos-excel/`). En la UI, `/revisor/usuarios` no deshabilita Editar, ambas acciones de
Contraseña y el interruptor de estado en una fila con perfil ADMIN: los OCULTA. Como `/dashboard/**`
es exclusivamente ADMIN y `/revisor/**` exclusivamente REVISOR_REPOSITORIO (garantizado por
`proxy.ts`), basta un booleano `actorEsAdmin` que cada `page.tsx` de área pasa como literal (`true`
en dashboard, `false` en revisor) al componente compartido `TablaUsuarios`, sin leer la sesión ahí.
Los ocho componentes de UI que antes vivían dentro de `app/dashboard/usuarios/` (`TablaUsuarios`,
`UsuarioForm`, `FiltrosUsuarios`, `ListadoUsuarios`, `PaginacionUsuarios`, `EsqueletoTablaUsuarios`,
`ContrasenaForm`, `EnlaceContrasenaForm`, más los helpers `opciones-perfil.ts` y
`opciones-formato-excel.ts`) se extrajeron a `shared/components/` con una prop `rutaBase: string`
(mismo patrón que `formatos-excel`), para que `/revisor/usuarios` los reutilice sin duplicar lógica.

El `<select>` de perfil en alta y edición (`app/revisor/usuarios/nuevo/page.tsx` y
`.../[id]/editar/page.tsx`) filtra la opción "Administrador" del catálogo antes de pasarlo a
`UsuarioForm`, salvo que sea el perfil ya vigente de la persona que se está editando (para no perder
su valor actual en el select cuando, por navegación directa a una URL, se llega a editar una cuenta
que ya es ADMIN). Es una mejora de UX sobre el mismo criterio de `TablaUsuarios`: ocultar en vez de
solo rechazar en el envío. El control real sigue siendo la regla en `application/` descrita arriba —
este filtrado del `<select>` no reemplaza esa verificación, solo evita mostrar una opción que el
servidor rechazaría.

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

### Acceso extendido a REVISOR_REPOSITORIO (posterior a RF-15)

Los 6 endpoints bajo `app/api/formatos-excel/` (`formatos-excel/_lib/http.ts` reexporta
`exigirAdminORevisor` en vez de `exigirAdmin`) y las pantallas de listar/crear/editar pasaron de
ser solo-ADMIN a acceso completo y simétrico para ADMIN y REVISOR_REPOSITORIO (crear, editar,
activar/desactivar, descargar plantilla, leer-plantilla), sin restricción de autoría — cualquiera
de los dos perfiles puede operar sobre cualquier formato, igual que ya operaba ADMIN. Ninguna regla
de negocio en `application/` ni en `infrastructure/auditoria/auditarFormatoExcel.ts` distinguía
entre perfiles, así que el cambio fue puramente de guard (mismo patrón ya usado por
`ventanas-carga`, ver más abajo). Los 5 componentes de UI que antes vivían dentro de
`app/dashboard/formatos-excel/` (`TablaFormatosExcel`, `TablaColumnasFormatoExcel`,
`EditorReglasValidacionFormatoExcel`, `AsistenteFormatoExcel`, `FormularioEdicionFormatoExcel`) se
extrajeron a `shared/components/` (convención plana, sin subcarpeta) para que `/revisor/formatos-excel`
los reutilice; la constante fija `RUTA_FORMATOS_EXCEL` se reemplazó por una prop `rutaBase: string`
que cada página (`/dashboard/formatos-excel` o `/revisor/formatos-excel`) resuelve, ya que el mismo
componente ahora sirve a dos rutas distintas.

### `contenidoPlantilla` nunca sale del repositorio

Mismo patrón que `contrasenaHash` en `Usuario`: el tipo de dominio `FormatoExcel` no tiene el
campo, y todos los `select` de Prisma en `PrismaFormatoExcelRepository` lo excluyen
explícitamente. Desde que la plantilla descargable se genera desde la BD (sección siguiente), ninguna
lectura lo trae: solo se escribe al crear. Se eliminaron `obtenerPlantilla()`, el caso de uso
`ObtenerPlantillaFormatoExcel` y el tipo `PlantillaFormatoExcel`.

### La plantilla descargable se genera desde la BD, no es el archivo subido

`GET /api/formatos-excel/[id]/plantilla` (NOTIFICADOR_RPC asignado, ADMIN y REVISOR_REPOSITORIO)
entrega un archivo **nuevo** armado por `GeneradorPlantillaExcelJs`
(`formatos-excel/infrastructure/escritura-plantilla/`) a partir de las columnas configuradas, en su
orden, con el tipo de archivo y el separador del formato: una sola hoja ("Datos") con una sola fila de
encabezados (en XLSX, en negrita, fija y con ancho mínimo; en CSV, UTF-8 con BOM). Motivo: el archivo
subido puede traer filas de ejemplo con datos reales, otras hojas, comentarios o metadatos de su
autor. El nombre de descarga es el del formato (`<nombre>.xlsx|csv`), no el del archivo original.
El NOTIFICADOR_RPC recibe siempre `.xlsx` (aunque el formato sea CSV); ADMIN y REVISOR_REPOSITORIO,
el tipo de archivo del formato.
`SincronizadorCabeceraPlantillaExcelJs` sigue usándose solo al crear el formato, sobre el binario que
se persiste.

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

**Limitación conocida:** el heurístico de firma de CSV rechaza un CSV en UTF-16 (bytes NUL). Los
CSV en UTF-8 (con o sin BOM) y Windows-1252 sí se aceptan (ver "Decodificación y separador de CSV",
RF-23).

Desde RF-23 el tipo de archivo lo **declara** el administrador en el asistente (`tipoArchivo`, más
`separadorCsv` si es CSV) y el servidor lo contrasta con el tipo detectado por extensión + firma;
si no coinciden responde 400 "El archivo no corresponde al tipo seleccionado". El declarado nunca se
acepta sin esa verificación.

### La regla "todo NOTIFICADOR_RPC tiene al menos un formato" vive en Zod + `application/`, no en la BD

Con una relación N:M no es expresable como `CHECK` de una sola tabla (haría falta un trigger, que
el proyecto evita). Se aplica dos veces por defensa en profundidad: `usuario.schema.ts`
(`.superRefine`, cruzando `perfilCodigo` y `formatosExcelIds`) rechaza el payload en el borde, y
`CrearUsuario`/`ActualizarUsuario` verifican además que cada id exista y esté activo con **una
sola consulta** (`FormatoExcelRepository.obtenerActivosEntre(ids)`), nunca un loop por id. En
edición, los formatos que la persona ya tenía se conservan aunque hayan sido dados de baja (mismo
criterio que "conserva su perfil actual" de RF-09); solo los ids nuevos deben estar vigentes.

Desde RF-24 ese caso solo lo producen **datos heredados**: desactivar un formato ahora borra todas
sus asignaciones (ver abajo), así que un formato dado de baja después de RF-24 ya no queda asignado
a nadie. Los formatos que ya estaban inactivos antes de RF-24 conservan sus asignaciones (sin
migración).

La regla se aplica también en dos caminos de `formatos-excel/` que quitan asignaciones:
desactivar/eliminar un formato (se **bloquea** con 409 `FORMATO_UNICO_DE_NOTIFICADORES`) y el retiro
masivo (se **excluye** al afectado e informa). "Único formato" es estructural: todas las filas del
notificador en `usuario_formato_excel` son ese formato, sin importar si el notificador o sus otros
formatos están activos — una sola consulta con `some` + `every`. Se cuentan los notificadores
inactivos porque reactivar una cuenta no pasa por el schema de usuario y volvería sin formatos.

### Asignación masiva de formatos (RF-24): procesamiento parcial dentro de una transacción `Serializable`

`POST /api/formatos-excel/[id]/asignaciones` no es todo-o-nada (decisión explícita del usuario): los
ids no elegibles se omiten e informan, igual que los excluidos por último formato. La clasificación
vive en la función pura de dominio `clasificarCambiosAsignacion` (`domain/entities/AsignacionFormato.ts`)
y se evalúa sobre el estado leído **dentro** de la transacción del repositorio
(`aplicarAsignacionesMasivas`), no antes en `application/`, para que no se desincronice por carrera.
Se audita **un evento por lote** (`FORMATO_EXCEL_ASIGNACION_MASIVA`, solo ids), no uno por usuario,
mismo criterio que `VENTANA_CARGA_ALERTA_MASIVA_ENVIADA`.

Las escrituras que dependen de filas de otros formatos (asignación masiva, desactivar, eliminar)
usan `isolationLevel: Serializable`. `@prisma/adapter-pg` traduce el SQLSTATE 40001 a P2034, que el
repositorio convierte en `ConflictoConcurrenteError` (409 `CONFLICTO_CONCURRENTE`, "vuelve a
intentarlo"; sin reintento automático). **Límite de la garantía:** solo se detectan entre sí las
transacciones `Serializable`; `PrismaUsuarioRepository` escribe en Read Committed, así que frente a
una edición de ficha solo queda cubierto el conflicto escritura-escritura sobre la misma fila de
`usuario_formato_excel` (ver deuda técnica en `docs/requerimientos.md`).

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
con `Readable.from()` (`node:stream`) porque `workbook.csv.read()` espera un stream. Desde RF-23 la
apertura y escritura con exceljs vive en un único punto transversal,
`src/infrastructure/hojas-calculo/abrirHojaExcelJs.ts`, usado por `LectorPlantillaExcelJs`,
`SincronizadorCabeceraPlantillaExcelJs` y `LectorArchivoReporteExcelJs` (ver "Decodificación y
separador de CSV" más abajo). **Nota de compatibilidad de tipos:** el `.d.ts` de `exceljs` 4.4.0 declara un
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
de archivo completo (`numeroFila: 0`), no de una fila puntual. Cada columna inesperada es su propio
error (una fila por columna en el resumen y en el Excel de errores), y si hay al menos una **se
detiene la validación**: no se evalúan filas, tipos ni reglas, solo se informan los errores de
estructura (inesperadas y faltantes). `cantidadFilasDatos` sigue reflejando las filas leídas.

### Convención chilena de formato de celda (primera vez definida en el proyecto)

`infrastructure/validacion/ValidadoresTipoDato.ts` es la primera vez que el proyecto valida un
*valor* real contra `TipoDatoColumna` (RF-13 solo validaba la etiqueta del tipo, nunca un dato).
Convención fijada por decisión explícita del usuario, sin antecedente previo que seguir: decimal con
coma o punto; fecha en texto `DD-MM-AAAA` o `DD/MM/AAAA`; fecha y hora en texto
`DD-MM-AAAA HH:mm[:ss]` (con `/` o `T` como separadores alternativos de fecha/hora); booleano acepta
`SI/NO`, `VERDADERO/FALSO`, `1/0` (case-insensitive). EMAIL usa `z.email()` de Zod. El RUT dejó de
ser un tipo de dato en RF-23: es la regla `RUT_VALIDO` (ver abajo).

### RUT como regla sobre un conjunto de columnas (RF-23)

Un tipo de dato valida una sola celda, y los reportes suelen traer el número y el dígito verificador
en columnas separadas, así que el RUT pasó a ser una regla de validación, `RUT_VALIDO`, con esta
convención de `columnas[]`: `[0]` es el RUT completo o el número, y `[1]` (opcional) el dígito
verificador. El evaluador une ambas como `número-dv` (convierte los números de xlsx a texto entero)
y valida con `esRutValidoFlexible()` (`shared/utils/rut.ts`), que acepta el RUT con o sin
puntos/guion y un cuerpo de 1 a 8 dígitos. **No se usa `esRutValido()`**: es la validación estricta
del login y se mantiene intacta. Si todas las columnas del conjunto vienen vacías, la regla no se
aplica (la obligatoriedad la da "requerida"); si falta solo una de dos, se rechaza. La migración
`20260928122049_migrar_tipo_dato_rut_a_regla` convirtió las columnas tipo RUT existentes en `TEXTO` +
una regla equivalente, y recreó el enum `TipoDatoColumna` sin `RUT`.

### Decodificación y separador de CSV (RF-23)

- **Codificación:** `decodificarTextoCsv()` (`shared/utils/texto-csv.ts`) quita el BOM UTF-8 y
  decodifica con `TextDecoder('utf-8', { fatal: true })`; si eso falla, usa `windows-1252` (el CSV
  "delimitado" que guarda Excel en Windows). A exceljs se le entrega texto ya decodificado, nunca el
  buffer. Es heurístico: un archivo Windows-1252 que por casualidad sea UTF-8 válido se lee como
  UTF-8 (riesgo bajo con texto en español). La plantilla CSV que se descarga se escribe con BOM
  (`agregarBomUtf8`) y se sirve como `text/csv; charset=utf-8` con `filename*=UTF-8''…`, para que
  Excel la abra sin mojibake.
- **Separador:** enum `SeparadorCsv` (`COMA`, `PUNTO_Y_COMA`, `TABULADOR`, `BARRA_VERTICAL`) en
  `formato_excel.separadorCsv`, NULL si y solo si `tipoArchivo = EXCEL` (CHECK
  `formato_excel_separador_csv_check`). exceljs lo recibe vía `parserOptions.delimiter` /
  `formatterOptions.delimiter`. El separador es editable y solo afecta a la plantilla.
- **Cargas del notificador: siempre Excel.** El tipo de archivo y el separador describen solo la
  plantilla con que el administrador define el formato. `ValidarYCargarArchivo` exige `.xlsx`
  (`ARCHIVO_NO_EXCEL`) sin importar el tipo del formato, así que `LectorArchivoReporte` no recibe
  separador. Su rama CSV (con coma) sigue existiendo solo para que `DarVistoBueno` pueda re-leer
  cargas CSV anteriores a esta regla.

**Limitación de origen, no de código:** en `.xlsx`, `exceljs` entrega siempre un `Date` nativo para
una celda de fecha, tenga o no componente de hora en Excel — a nivel de valor no hay forma de
distinguir "solo fecha" de "fecha y hora", así que `FECHA` y `FECHA_HORA` aceptan lo mismo en xlsx.
La distinción real de formato solo existe en `.csv`, donde el texto sí declara si trae hora.
**Actualización (2026-10-05):** el tipo `FECHA_HORA` se eliminó del enum `TipoDatoColumna`
(migración `20261005120000_quitar_tipo_dato_fecha_hora`, que convierte a `FECHA` cualquier columna
que lo tuviera). Las columnas de fecha solo validan la fecha; en `.csv` exigen `DD-MM-AAAA` o
`DD/MM/AAAA` sin hora. Las menciones a `FECHA_HORA` más abajo son históricas.
En la misma fecha se eliminó la regla `FECHA_DENTRO_DE_VENTANA_VIGENTE` (migración
`20261005130000_quitar_regla_fecha_dentro_ventana`, que borra las reglas que la usaran): se
solapaba con `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA`, que queda como única regla de fecha. Las
menciones a esa regla más abajo también son históricas.

### Tipos de dato enumerados por formato (RF-35)

Además de los tipos fijos, una columna puede ser `ENUMERADO`: solo acepta los valores de una lista
que define quien crea o edita el formato. Decisiones:

- **El enum es propio de cada formato, no un catálogo global.** El asistente no guarda nada hasta
  "Crear formato"; un catálogo global obligaría a guardar el enum antes y dejaría huérfanos si se
  cancela. Así, los enums (`tipo_enumerado_formato_excel`, `valores text[]`, FK `Cascade`) viajan en
  el mismo payload que columnas y reglas y se reemplazan con el mismo `deleteMany + create` atómico.
  No hay endpoints, guards ni acciones de auditoría nuevos (la edición audita
  `campos: ["tiposEnumerados"]`, nunca los valores). Precio: un enum que usan dos formatos se define
  dos veces.
- **La columna referencia el enum por nombre** (`columna_formato_excel.tipoEnumeradoNombre`), no por
  FK: `actualizar()` regenera los ids de los hijos y Prisma no deja que un hijo de un nested write
  apunte al id de otro hijo de la misma llamada (mismo motivo que `ReglaValidacionFormatoExcel.columnas`).
  La invariante `tipoDato = ENUMERADO` ⇔ `tipoEnumeradoNombre` no nulo vive en un `CHECK` escrito a
  mano, en Zod y en `application/resolverTiposEnumerados.ts`, que además guarda siempre el nombre
  tal como está en el enum.
- **Dos migraciones** (`20261005140000_agregar_tipo_dato_enumerado`, solo `ADD VALUE`, y
  `20261005140100_agregar_tipos_enumerados_formato`): PostgreSQL no permite usar un valor de enum
  recién agregado en la misma transacción, y el `CHECK` lo referencia.
- **Una sola regla de comparación:** `normalizarValorEnumerado` (`formatos-excel/domain/entities/TipoEnumerado.ts`)
  aplica NFC + trim + `toLocaleLowerCase("es")`: ignora mayúsculas, distingue acentos, y NFC evita
  que una "í" descompuesta (CSV de Mac) no coincida. La usan Zod (duplicados al definir) y la
  validación de la carga. La celda pasa antes por `aTextoCelda`, así que un número `1` de Excel no
  coincide con `"01"`.
- **Validador parametrizado sin romper el `Record`:** `ValidadoresTipoDato` queda tipado sobre los
  tipos fijos y `crearValidadorColumna(columna, tiposEnumerados)` arma un `Set` por columna una sola
  vez, antes del recorrido de filas. Si una columna `ENUMERADO` no encuentra su enum (inalcanzable por
  el CHECK y Zod), lanza: es un formato corrupto, no un dato inválido del notificador.
- **Mensaje:** `TIPO_DATO_INVALIDO` lista los valores permitidos si son 10 o menos, nunca el valor
  recibido.
- **Edición:** no se puede eliminar un enum en uso; renombrarlo actualiza sus columnas
  (`shared/components/useTiposEnumeradosFormato.ts`). Como los demás tipos, editar un enum no revalida
  cargas ya validadas: una `PENDIENTE_VISTO_BUENO` se aprueba con el resultado que tuvo al subir.

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
bueno ya dado (decisión explícita del usuario).

**Corrección posterior (RF-20 ampliado):** originalmente el mismo notificador que subía el archivo
podía autoaprobarse (`POST /api/notificador/cargas/[id]/visto-bueno`, eliminado). Se corrigió porque
una autoaprobación sin revisión de un tercero no cumplía el objetivo de control del sistema: el
notificador ahora solo **finaliza y envía** (`POST /api/notificador/cargas/[id]/finalizar`, caso de
uso `FinalizarYEnviarCarga`), lo que marca `finalizadaEn = now()` en la carga SIN cambiar su `estado`
(sigue `PENDIENTE_VISTO_BUENO`, que pasa a significar "enviada, pendiente de que un tercero decida"
en vez de "pendiente de que el propio notificador se autoapruebe"). Mientras esté finalizada sin
decisión, la tarjeta de esa combinación (formato, ventana) desaparece por completo del panel del
notificador (`panel-carga-archivo.tsx`, filtro `combinacionesVisibles`) — mecanismo principal para
que nunca intente subir un archivo nuevo encima; `ValidarYCargarArchivo` lo bloquea también en
servidor (`CARGA_PENDIENTE_DECISION`) como defensa de segunda línea. La decisión real (aprobar o
rechazar) pasa a ADMIN o REVISOR_REPOSITORIO, desde la tabla del detalle de ventana (ver más abajo);
ninguno de los dos necesita ser el mismo que subió el archivo. `darVistoBueno()` ya no valida
ownership del actor: exige `estado === "PENDIENTE_VISTO_BUENO" && finalizadaEn !== null` y recibe
`aprobadoPorId` (quien realmente aprueba, para `vistoBuenoPorId`), no asume que el actor es el dueño.

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

### Segundo tipo de regla de fecha: año calendario, no rango exacto, y sobre varias columnas

`FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` (ampliación posterior a la entrega inicial de RF-15) nace
del requerimiento de negocio de validar la "fecha de diagnóstico" de un registro: si viene vacía,
hay que caer a la más antigua entre "fecha de toma de muestra" y "fecha de recepción de muestra".
Esa selección de valor (tomar la fecha más antigua entre varias) es una función, no un predicado
booleano, así que no encaja en un árbol AND/OR genérico de reglas — se evaluó esa alternativa y se
descartó explícitamente: un motor genérico no evita escribir esta lógica a medida de todos modos,
solo la complica. Se implementó como un tipo FIJO más en `TipoReglaValidacionFormatoExcel`, mismo
patrón que los otros dos.

Reutiliza `ReglaValidacionFormatoExcel.columnas: string[]` con una convención posicional propia de
este tipo: `columnas[0]` es la columna PRINCIPAL, `columnas[1..]` son las ALTERNATIVAS (mínimo 1,
sin tope), documentada en el comentario de `domain/entities/FormatoExcel.ts` y validada en
`formato-excel.schema.ts` (mínimo 2 columnas en total, y **todas** — no solo `columnas[0]` como en
`FECHA_DENTRO_DE_VENTANA_VIGENTE` — deben ser `FECHA`/`FECHA_HORA`).

`EvaluadorReglasValidacion.cumpleReglaValidacion()` gana el `case` nuevo con esta prioridad: (1)
principal con valor parseable → fecha efectiva; (2) principal vacía → la más antigua entre las
alternativas con valor parseable; (3) ninguna columna (principal ni alternativas) aporta una fecha
utilizable → la regla falla, sin depender de que alguna columna esté marcada `requerida` (decisión
explícita del usuario, confirmada dos veces durante el diseño). Compara
`fechaEfectiva.getFullYear() === contexto.ventana.anio` — el año CALENDARIO de la ventana, campo ya
persistido en `VentanaCarga.anio`, no el rango `fechaApertura`/`fechaVencimiento` que usa
`FECHA_DENTRO_DE_VENTANA_VIGENTE`. Por eso `ContextoEvaluacionReglas.ventana` gana `anio: number`
junto a las dos fechas ya existentes; `ValidarYCargarArchivo` no cambió su llamada porque ya pasaba
la entidad `VentanaCarga` completa (que ya traía `anio`), solo el tipo del contexto se amplió.

Mismo criterio anti-duplicado que la regla anterior: una columna (principal o alternativa) con
algún valor que no parsea como fecha ya quedó reportada como `TIPO_DATO_INVALIDO` en el paso
anterior de `ValidarYCargarArchivo`; para la lógica de selección se trata como "no utilizable" (ni
aporta una fecha válida, ni cuenta como "vacía" para decidir si cae al caso 3), evitando reportar
dos errores sobre la misma celda.

En la UI (`EditorReglasValidacionFormatoExcel.tsx`), este tipo agrega dos controles en vez de uno:
un `CampoSelect` para la columna principal y un `CampoSeleccionMultiple` para las alternativas,
ambos filtrados a columnas `FECHA`/`FECHA_HORA` del formato. Las opciones de alternativas excluyen
la columna ya elegida como principal (y cambiar la principal descarta esa columna de las
alternativas si ya estaba marcada ahí), para que la misma columna nunca cuente dos veces en la
misma regla.

Migración `20260915153431_agregar_regla_fecha_efectiva_anio_ventana`: aditiva
(`ALTER TYPE "TipoReglaValidacionFormatoExcel" ADD VALUE ...`), sin backfill (ninguna fila existente
usaba este valor). Mismo caveat que las migraciones de enum anteriores de este módulo (RF-14/15):
si el proceso de `next dev`/producción ya estaba corriendo, el cliente de Prisma en memoria no ve
el valor nuevo hasta reiniciar con `prisma generate` + restart.

### Cuarto tipo de regla: `FILA_DUPLICADA` — la primera que exige memoria entre filas

Ampliación posterior a RF-13/14/15, a pedido explícito del usuario: detectar filas que repiten
exactamente los mismos valores en un conjunto de columnas dentro del mismo archivo. Se agrega a
`TipoReglaValidacionFormatoExcel` con el mismo mecanismo de persistencia que las tres reglas
anteriores (columnas por **nombre**, `mensaje` configurado por el operador), pero es una extensión
real del motor de evaluación, no solo un `case` nuevo:

**Regla pura vs. regla con estado.** Las tres reglas previas son funciones puras: reciben una fila
y deciden, sin recordar nada de filas anteriores. `FILA_DUPLICADA` necesita memoria de todo lo ya
visto en el archivo para poder decidir si la fila actual repite una combinación anterior. Por eso
`EvaluadorReglasValidacion.cumpleReglaValidacion()` (que se mantiene puro a propósito) devuelve
`true` sin evaluar nada para este tipo, y el chequeo real vive en dos funciones nuevas del mismo
archivo: `crearRastreadorFilasDuplicadas(reglas)` construye, una sola vez por carga, un
`Map<reglaId, Map<claveSerializada, numeroFilaOriginal>>` (una entrada de mapa por cada regla
`FILA_DUPLICADA` del formato, para que dos reglas de este tipo con columnas distintas no
interfieran entre sí); `evaluarFilaDuplicada(rastreador, regla, fila, numeroFila)` construye la
clave de la fila actual y decide. `ValidarYCargarArchivo` crea el rastreador antes del `forEach`
que ya recorre las filas y lo consulta dentro del mismo recorrido — sin una segunda pasada sobre el
archivo ni bucles anidados, manteniendo la complejidad en O(filas) por regla de este tipo.

**Cuatro decisiones de negocio confirmadas por el usuario, todas en `evaluarFilaDuplicada` y en
`ValidadoresTipoDato.serializarValorParaClaveDuplicado()`:**

1. **Columnas configurables, mínimo 1** (no 2 como `ALGUNA_COLUMNA_CON_VALOR`): con 1 sola columna
   la regla es válida — p. ej. detectar un RUT repetido — así que `formato-excel.schema.ts` NO
   aplica a este tipo la restricción de mínimo 2 que sí aplica a `ALGUNA_COLUMNA_CON_VALOR`, y se
   queda con el mínimo genérico de 1 que ya exige el esquema base de toda regla. En la UI
   (`EditorReglasValidacionFormatoExcel.tsx`), a diferencia de las dos reglas de fecha, el selector
   de columnas de `FILA_DUPLICADA` NO filtra por `tipoDato`: ofrece todas las columnas del formato,
   porque la comparación de igualdad de valores no depende de que la columna sea de un tipo en
   particular. Gana además un atajo de UI de un solo sentido, "Seleccionar todas las columnas",
   visible solo en esta rama, que precarga `columnas[]` con el nombre de todas las columnas del
   formato — es pura conveniencia de UI, no un modo de almacenamiento distinto: el resultado sigue
   siendo el mismo `columnas: string[]` que usan las demás reglas.
2. **Comparación case-sensitive tras `trim()`** (no case-insensitive, a diferencia de la
   comparación de nombres de columna en `formato-excel.schema.ts`): "Juan" y "JUAN" son valores
   distintos para esta regla. `serializarValorParaClaveDuplicado()` normaliza cada celda a texto
   (`Date` → ISO, `number`/`boolean` → su representación literal, `string` → `trim()` sin
   `toLowerCase()`, vacía → `null`) antes de armar la clave. La clave de la fila es
   `JSON.stringify(valoresClave)` sobre el **array** de valores serializados (no una concatenación
   con separador): `JSON.stringify` produce una representación textual unívoca de esa combinación
   de valores, distinguiendo automáticamente `null` (columna vacía) de la cadena literal `"null"`,
   y escapa comillas/backslashes de cualquier valor de texto real sin depender de que algún
   carácter esté garantizado ausente del contenido de la celda.
3. **Solo la 2ª aparición en adelante se marca.** El rastreador guarda el número de fila de la
   primera vez que aparece cada clave ("el original") y nunca la reporta como error; solo la
   siguiente vez que la misma clave reaparece se reporta.
4. **Celdas vacías en la clave excluyen la fila del chequeo.** Si el valor de la fila en **todas**
   las columnas de la clave de esa regla está vacío (mismo criterio que `celdaVacia()`), esa fila
   nunca se considera duplicada de otra — ni se agrega al mapa, así que tampoco puede convertirse
   en "el original" de una futura fila igualmente vacía. Si solo alguna de las columnas de la clave
   está vacía (no todas), esa ausencia sí cuenta como parte de la clave (representada como `null`
   en el array que serializa `JSON.stringify`, distinto de cualquier valor real de texto/número), para
   no confundir "una columna vacía" con "clave completa vacía".

Reporta con el mismo contrato que las demás reglas: `tipoError: "REGLA_VALIDACION"`,
`columna: null` (mismo criterio que `ALGUNA_COLUMNA_CON_VALOR`, por involucrar varias columnas),
`mensaje: regla.mensaje` sin texto dinámico agregado. Migración
`20260917142311_agregar_regla_fila_duplicada`: aditiva (`ALTER TYPE ... ADD VALUE`), sin backfill,
mismo caveat de reinicio del cliente de Prisma en memoria que las migraciones de enum anteriores.

### Sexto y séptimo tipo de regla: `CONTENIDO_HTML` y `FILA_VACIA` (RF-32)

**`columnas: []` significa "todas las columnas".** Ambos tipos se aplican a la fila completa, así que
no guardan columnas (`TIPOS_REGLA_TODAS_LAS_COLUMNAS` en `FormatoExcel.ts`, compartido por el esquema
y el editor). Con una lista explícita, eliminar una columna del formato borraría la regla entera
(`useEliminarColumnaFormato`) y una columna agregada después quedaría sin cubrir. El esquema exige
`[]` para estos tipos y ≥ 1 columna para los cinco anteriores (sin cambio para ellos), y como máximo
una regla de cada tipo nuevo por formato (dos iguales duplicarían cada error).

**El lector no cambia.** `LectorArchivoReporteExcelJs` entrega todas las filas de 2 a `rowCount`,
incluidas las vacías (Excel escribe `<row>` para filas con solo formato, por eso las residuales del
final ya llegan). Así `indice + 2` sigue siendo el número de fila real tanto al validar como al
publicar. Toda la lógica nueva vive en el caso de uso y en funciones puras de dominio
(`reporte-excel/domain/reglas/filasArchivo.ts`: `filaCompletamenteVacia`, `indiceUltimaFilaConDatos`,
usadas por `ValidarYCargarArchivo` y `DarVistoBueno`).

**Filas vacías.** `indiceUltimaFilaConDatos` se calcula siempre, sobre el archivo completo y antes del
tope de filas. Si es `-1` (y se reconoció al menos una columna) el archivo se rechaza con
`SIN_FILAS_DATOS` en **todos** los formatos, con `cantidadFilasDatos = 0` (decisión del usuario). Solo
si el formato tiene `FILA_VACIA`: las filas tras la última con datos se recortan (no se validan, no se
cuentan y `DarVistoBueno` no las publica), y cada fila vacía intermedia produce un único error sin
seguir validándola (evita N `VALOR_REQUERIDO_VACIO` sobre la misma causa). Formatos sin la regla
recorren y publican las filas como antes.

**Detector de HTML (`infrastructure/validacion/DetectorContenidoHtml.ts`).** Función pura con filtro
barato (sin `<` ni `&` no evalúa nada). Etiquetas: lista cerrada de elementos HTML (no "cualquier
palabra", para no marcar `<sin dato>` o `<NA>`) o prefijos de Office en lista cerrada
(`o|w|v|m|x|st0-9`; una lista abierta marcaba la notación TNM `<T1:N0>`). Tras el nombre: `>`, `/>`,
espacio + atributos, o `/` seguido de un atributo con `=` (detecta `<svg/onload=1>` sin marcar
`<u/l>`). Comentarios con `indexOf` (la regex equivalente era vulnerable a ReDoS con miles de `<!--`),
`<!doctype`/`<?xml`, y entidades con `;` obligatorio (`R&D`, `A & B` pasan). Todas las clases de
atributos son negadas (`[^<>]*`) y nunca dos clases solapadas seguidas, para que el costo sea lineal;
la prueba unitaria incluye entradas de cientos de miles de caracteres. Es una regla de calidad de
datos, no una defensa XSS: el contenido de la celda nunca se incluye en el mensaje ni en logs. Un
error por celda, con su columna, dentro del tope existente de 500 errores.

**Etiqueta de la columna "Fila" para errores de archivo.** `etiquetaFila(numeroFila, tipoError)`
(`shared/utils/erroresCargaArchivo.ts`) muestra "Archivo" para `SIN_FILAS_DATOS`, "Columna
desconocida" para errores de columna y "—" para el resto de los errores con fila 0, en pantalla y en el
Excel de errores. Las etiquetas visibles de los tipos de regla viven en `shared/utils/reglasValidacion.ts`
(`Record<TipoReglaValidacion, string>`: un tipo nuevo sin etiqueta no compila).

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

### Cantidad de cargas por ventana y detalle de cargas aprobadas (ampliación de RF-15)

Agregado después de la entrega inicial de RF-15, a pedido explícito del usuario: la tabla de
ventanas gana visibilidad sobre cuántas cargas aprobadas tiene cada una y una pantalla de detalle
para revisarlas, sin duplicar ninguna consulta.

**`VentanaCarga.cantidadCargas` vía `_count`, mismo patrón que `FormatoExcelResumen.cantidadReglas`.**
`SELECCION_VENTANA` (`PrismaVentanaCargaRepository.ts`) agrega
`_count: { select: { cargas: { where: { estado: "APROBADA" } } } }`: el conteo se filtra dentro del
propio `_count`, en la misma consulta que ya trae el resto de la ventana, así que `listar()` no
incurre en N+1 al pintar la columna "Cargas" de `TablaVentanasCarga`. Como esta selección la
comparten `crear`/`listar`/`obtenerPorId`/`obtenerPorAnioYFormato`/`actualizar`/`cambiarPublicacion`,
`cantidadCargas` viaja en las seis, aunque solo el listado y el detalle lo muestren.

**Filtro por ventana reutiliza `listarAprobadas`, no un caso de uso nuevo.**
`FiltroListadoCargasAprobadas` (`modules/reporte-excel/domain/entities/CargaArchivo.ts`) gana
`ventanaCargaId?: string`, opcional y aplicado siempre junto a `estado: APROBADA` en el mismo
`WHERE` de `PrismaCargaArchivoRepository.listarAprobadas()` — nunca como filtro separado ni en la
UI. `listarCargasAprobadas()` (el caso de uso) no cambió: ya recibía el filtro completo y lo pasaba
tal cual al repositorio, así que extender el tipo de filtro bastó para soportar el detalle por
ventana sin tocar la capa de aplicación.

**Páginas nuevas, mismo guard que el resto del área.** `/dashboard/ventanas-carga/[id]` y
`/revisor/ventanas-carga/[id]` no agregan ningún Route Handler ni guard propio: quedan cubiertas por
el `matcher` ya existente de `src/proxy.ts` (`/dashboard/:path*`, `/revisor/:path*`), igual que el
resto de páginas de ambas áreas. Cada `page.tsx` resuelve `obtenerVentanaCarga(id, ...)` para el
encabezado (`notFound()` si no existe) y delega el cuerpo a `shared/components/DetalleVentanaCarga`
(compartido entre ambas áreas, mismo patrón que `DetalleCargaAprobada`), que a su vez renderiza
`ListadoCargasVentana` (pagina el listado con el mismo esquema `listadoCargasSchema`/25-50-100 que
`/dashboard/cargas`) y `TablaCargasVentana`. Es una pantalla de solo lectura: no se audita el
acceso, mismo criterio que el resto del proyecto para lecturas.

**`TablaCargasVentana` no exporta ningún mapper, a diferencia de `TablaCargasAprobadas`.**
`TablaCargasAprobadas.tsx` exporta `aFilaCargaAprobadaVista` junto al componente — señalado por
`react-doctor` (`only-export-components`) como ruido pre-existente fuera de este alcance, no
corregido aquí. Para no repetir el mismo patrón en código nuevo, `ListadoCargasVentana` (el Server
Component) arma la fila de vista inline y `TablaCargasVentana.tsx` solo exporta el componente y su
tipo de props.

**Descarga reutilizada sin cambios.** El enlace "Descargar" de cada fila apunta al mismo
`GET /api/dashboard/cargas/[id]/archivo` que ya usa `DetalleCargaAprobada` (guardado por
`exigirAdminORevisor`, y que ya filtra `estado = APROBADA` en su propia consulta): no hizo falta
ningún endpoint nuevo.

**`<ViewTransition>` de `react`, sin instalar `react@canary`.** El enlace "Detalle" en
`TablaVentanasCarga` y el contenedor principal de `DetalleVentanaCarga` (el "contenido de la
página", no un layout — los layouts persisten entre navegaciones y nunca disparan enter/exit) usan
`<ViewTransition>` importado directamente desde `"react"`. Aunque el paquete `react` instalado en
`node_modules` (canal estable) no exporta ese componente en tiempo de ejecución ni en sus tipos, el
propio paquete `next` sí: `node_modules/next/dist/types.d.ts` referencia `react/experimental`
(`@types/react/experimental.d.ts`, que a su vez importa `canary.d.ts`), lo que amplía el módulo
ambiental `"react"` con los tipos de `ViewTransition` para todo el proyecto; y en tiempo de
ejecución, el App Router de Next sustituye `react`/`react-dom` por su propia copia interna en canal
canary (`next/dist/compiled/react`, que sí implementa `ViewTransition`) al compilar páginas y
componentes de `app/`. Verificado con `npx tsc --noEmit` y `npm run build` antes de dar esta
ampliación por terminada.

### Archivar/desarchivar ventanas, buscador y filtro por formato (ampliación de RF-15)

Agregado después de la entrega inicial de RF-15, a pedido explícito del usuario: un cuarto eje de
estado, independiente de `publicada`/`eliminadaEn`, para ocultar ventanas de la vista por defecto
del panel administrativo sin perderlas (recuperables por búsqueda), simétrico entre ADMIN y
REVISOR_REPOSITORIO.

**`VentanaCarga.archivada`, un eje nuevo, no una reutilización de `eliminadaEn`/`publicada`.**
`eliminadaEn` es irreversible y está atado al `ON DELETE RESTRICT` de `CargaArchivo`; `publicada`
es el efecto que gobierna la visibilidad para el notificador, no la causa de "oculta del listado
administrativo". Ninguno de los dos expresaba "oculta pero recuperable", así que se agregó
`archivada Boolean @default(false)` (migración `20260916124153_agregar_archivada_ventana_carga`,
aditiva, sin backfill: el default cubre las filas existentes). Sin restricción de estado previo:
se puede archivar cualquier ventana, en cualquier combinación de `publicada`/`eliminadaEn`.

**Archivar despublica en la MISMA escritura atómica; desarchivar no vuelve a publicar sola.**
`publicacionResultanteAlArchivar(publicadaActual, archivada)` (`domain/entities/VentanaCarga.ts`)
es la única función que decide el valor resultante de `publicada` al cambiar `archivada`: devuelve
`false` si se está archivando, o `publicadaActual` sin cambios si se está desarchivando. El caso de
uso `cambiarArchivadoVentanaCarga` la usa para construir el `data` de una sola llamada a
`VentanaCargaRepository.cambiarArchivado(id, { archivada, publicada })`, que
`PrismaVentanaCargaRepository` resuelve con un único `prisma.ventanaCarga.update()` (mismo patrón
que `cambiarPublicacion`, sin `$transaction`: es una sola sentencia SQL). El resultado es que nunca
existe un estado observable con `archivada: true` y `publicada: true` simultáneamente, por lo que
`listarDisponibles()` (usado por `/notificador` y por `TableroSeguimientoVentanas`, RF-16) no
necesitó ningún cambio: ya filtraba `publicada: true`.

**`CambiarPublicacionVentanaCarga` cierra el hueco de saltarse "Desarchivar".** Sin este cambio,
alguien podría llamar directamente al endpoint de publicación ya existente para volver a publicar
una ventana archivada sin pasar por "Desarchivar", dejando el estado peligroso que el punto
anterior evita. `puedePublicarse(ventana)` (`domain/entities/VentanaCarga.ts`) extrae la regla
completa (`eliminadaEn === null && !archivada`) en un solo lugar; el caso de uso solo la aplica
cuando se intenta ACTIVAR la publicación (`publicada: true`) — despublicar una ventana archivada
sigue permitido siempre (aunque no debería hacer falta, ya debería estar en `false`). El motivo de
rechazo nuevo `VENTANA_ARCHIVADA` viaja con la misma forma que el `VENTANA_ELIMINADA` ya existente,
mapeado a 409 por `respuestaVentanaArchivada()` (`app/api/dashboard/ventanas-carga/_lib/http.ts`).

**Endpoint dedicado, copia estructural de `.../publicacion`.**
`PATCH /api/dashboard/ventanas-carga/[id]/archivado` (`route.ts` nuevo) reutiliza el mismo guard
`exigirAdminORevisor()`, el mismo esquema Zod (`cambiarArchivadoVentanaCargaSchema`, `{ archivada:
boolean }`) y el mismo patrón de respuesta/auditoría que el endpoint de publicación — sin
restricción de ownership, simétrico entre ambos perfiles. Un solo evento de auditoría por operación
(`VENTANA_CARGA_ARCHIVO_CAMBIADO`, éxito y rechazos `SIN_PERMISO`/`NO_ENCONTRADO`), aunque
internamente se toquen dos columnas: refleja la intención real del actor. El evento incluye tanto
`archivada` (nuevo valor) como `publicada` (valor resultante), reutilizando el campo `publicada` que
ya existía en `EventoAuditoria` para `VENTANA_CARGA_PUBLICACION_CAMBIADA`.

**Buscador y filtro resueltos en cliente, sin endpoint ni consulta SQL nueva.**
`TablaVentanasCarga` (componente compartido) filtra el arreglo ya cargado por el servidor: coincidencia
de texto contra el año (como string) y el nombre del formato, un `<select>` de formato con "Todos" que
reutiliza el mismo catálogo de opciones que el formulario de creación/edición, y un interruptor
"Mostrar archivadas" (apagado por defecto, oculta las filas archivadas salvo que se active). La
columna "Estado" ganó un cuarto valor, "Archivada", con la misma prioridad visual que ya tenía
"Eliminada" (una fila eliminada sigue mostrando "Eliminada" aunque también esté archivada:
`resolverEstadoVentana()` resuelve esa jerarquía en un solo lugar). El botón "Archivar"/"Desarchivar"
es independiente de "Editar"/"Eliminar": va siempre visible, incluso con la ventana eliminada
lógicamente o en edición (a diferencia de esos dos, que sí se ocultan). El interruptor "Publicada" se
bloquea también cuando `archivada === true`, con el mismo mecanismo de tooltip ya usado para
`eliminadaEn`.

**Extracción a subcomponentes y a un hook genérico, para no degradar la complejidad del componente
compartido.** `TablaVentanasCarga.tsx` ya era un componente grande antes de esta ampliación; agregar
el buscador, el diálogo de archivado y la columna/botón nuevos sin reestructurar habría cruzado el
umbral de complejidad de `react-doctor` (`no-high-complexity-react-function`). Se extrajeron
`BuscadorVentanasCarga` (la barra de filtros), `FilaVentanaCarga`/`AccionesFilaVentana` (una fila y
su celda de acciones, sin estado propio: reciben callbacks) y un hook `useAccionConfirmable<T>` que
generaliza el patrón "objetivo pendiente + procesando + error + confirmar" ya repetido por
eliminar/publicar y ahora también por archivar, en vez de triplicar el mismo bloque de `try/catch`.

### Tablero de seguimiento de ventanas de carga abiertas (RF-16)

**Reutiliza "abierta" tal cual, no la reimplementa.** `TableroSeguimientoVentanas`
(`shared/components/`, Server Component puro, montado en `src/app/dashboard/page.tsx` y
`src/app/revisor/page.tsx`) invoca `VentanaCargaRepository.listarDisponibles(ahora)` — el mismo
método que ya usa `src/app/notificador/page.tsx` para decidir qué ventanas ofrecerle a un
notificador. "Abierta" sigue significando exactamente lo mismo en todo el sistema: fechas dentro de
rango, `publicada = true`, no eliminada.

**Dos conteos agregados nuevos, deliberadamente distintos entre sí.**
`FormatoExcelRepository.contarNotificadoresAsignadosActivosPorFormato(formatoExcelIds)` (nuevo,
`PrismaFormatoExcelRepository.ts`) agrupa `usuario_formato_excel` por `formatoExcelId` filtrando
`usuario.activo = true` y `perfilCodigo = NOTIFICADOR_RPC`; como esa tabla es única por
`(usuarioId, formatoExcelId)`, contar filas del grupo ya equivale a contar usuarios distintos, sin
`DISTINCT` adicional. Es una cuenta **estructural**: no filtra por `FormatoExcel.activo`, así que un
formato dado de baja después de crear la ventana sigue contando a sus notificadores asignados como
"deben reportar" (decisión explícita del usuario, para no tener que decidir además si mostrar 0 en
ese caso).

**Actualizado por RF-34:** el método ahora es
`contarNotificadoresReportaronPorVentana(ventanaCargaIds, ahora)` y solo cuenta al notificador cuya
APROBADA vigente (más reciente por `vistoBuenoEn`, sin superar) no está en reemplazo: sin solicitud
utilizable sobre ella, sin carga `PENDIENTE_VISTO_BUENO` finalizada en la combinación y sin una
reapertura que autorice reemplazarla (`solicitudUtilizable` y `reaperturaAutorizaReemplazo`, las
mismas reglas de RF-33). Hace tres consultas en paralelo para todas las ventanas (aprobadas con sus
solicitudes sin usar, `groupBy` de pendientes finalizadas y rechazos con reapertura sin consumir) y
deduplica por par en JS. Las alertas de RF-17 no usan este conteo. Texto original de RF-16:

`CargaArchivoRepository.contarNotificadoresDistintosPorVentana(ventanaCargaIds)` (nuevo,
`PrismaCargaArchivoRepository.ts`) SÍ necesita `DISTINCT` real, y a propósito no usa un `_count`
simple: `CargaArchivo` no tiene ninguna restricción de unicidad sobre `(usuarioId, ventanaCargaId)`,
así que un notificador puede acumular varias cargas `APROBADA` en la misma ventana (correcciones
sucesivas ya validadas). Contar filas sobre-contaría a ese notificador. La consulta agrupa por el
PAR `(ventanaCargaId, usuarioId)` — el `groupBy` devuelve como máximo una fila por combinación,
aunque ese usuario tenga N cargas aprobadas ahí — y el conteo final por ventana se reduce en JS
contando esas filas. El código deja un comentario explícito de por qué se agrupa por el par y no se
"simplifica" a un `_count` plano, precisamente para que nadie reintroduzca el sobre-conteo más
adelante. `VentanaCarga.cantidadCargas` (RF-15, cuenta **filas** de `CargaArchivo` para la columna
"Cargas" de la tabla administrativa) es un campo distinto y no sirve para esto.

**Sin librería de gráficos.** El proyecto no tenía ninguna instalada. `GraficoTortaProporcion`
(`shared/components/`) dibuja el pie de 2 segmentos con un solo `div` circular y
`background: conic-gradient(...)` calculado inline (el ángulo es dinámico, no expresable como clase
Tailwind estática) — sin SVG, sin dependencia nueva. Si `total === 0` no dibuja el gráfico: muestra
el mensaje "Sin notificadores asignados a este formato" en su lugar, para no dividir por cero ni
mostrar un círculo sin significado. La proporción siempre va acompañada de texto ("X de Y
notificadores reportaron"), no solo color, por accesibilidad.

**Umbral de alerta como constante de dominio, no como configuración en BD.**
`UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA = 45` vive junto a `estaAbierta`/`disponibleParaNotificador`
en `modules/ventanas-carga/domain/entities/VentanaCarga.ts`, mismo patrón que
`TOPE_FILAS_DATOS`/`TOPE_ERRORES_PERSISTIDOS` de RF-14: un valor que un desarrollador cambia en el
código y despliega, no algo que nadie pidió gestionar en tiempo de ejecución. Agregar una tabla de
configuración para un único valor sin ese requisito habría sido sobre-ingeniería.
`calcularDiasRestantes`/`calcularFraccionTiempoTranscurrido` son funciones puras nuevas junto a la
constante. La barra de progreso (`BarraProgresoVentana`) representa **tiempo transcurrido** (se
llena con el tiempo, no se vacía) — decisión explícita del usuario — y pasa a la paleta de peligro
cuando `diasRestantes <= UMBRAL_DIAS_ALERTA_VENCIMIENTO_VENTANA`.

**Rendimiento: 3 consultas fijas, nunca una por tarjeta.** El caso de uso nuevo
`ObtenerResumenSeguimientoVentanasAbiertas` (`modules/ventanas-carga/application/use-cases/`) llama
`listarDisponibles`, y luego los dos métodos agregados de arriba en paralelo (`Promise.all`),
pasándoles todos los ids de una vez — nunca dentro de un loop por ventana. Solo conoce interfaces de
`domain/repositories/`, igual que el resto de `application/`.

**`export const dynamic = "force-dynamic"` agregado a `src/app/dashboard/page.tsx`.** Antes de este
cambio esa página no leía ninguna API dinámica (a diferencia de `/revisor/page.tsx`, que ya es
dinámica porque llama `obtenerSesionActual()`), así que Next la generaba **estática en build time**.
Sin este flag, los datos del tablero (que dependen de `ahora` y del estado real de la BD) habrían
quedado congelados en la foto del build para siempre en producción. Confirmado comparando la tabla
de rutas de `npm run build` antes (`○ /dashboard`) y después (`ƒ /dashboard`) del cambio. `ahora` se
genera siempre con `new Date()` dentro del caso de uso, nunca recibido del cliente.

Sin endpoints `/api/` nuevos (todo el árbol es Server Components sobre repositorios ya existentes),
sin migración de esquema, sin auditoría (es una lectura, mismo criterio del resto del proyecto).

### Historial de intentos fallidos, detalle propio y descarga de errores en Excel (RF-14)

**"Ocultar la tarjeta tras aprobar" se deriva, no se persiste.** El pedido original describía un
botón "Finalizar" nuevo; tras varias rondas de aclaración con el usuario, la resolución final fue
que "finalizar" y "dar visto bueno" son la misma acción — no hay botón, tabla ni endpoint nuevo para
esto. `DarVistoBueno.ts` y `POST /api/notificador/cargas/[id]/visto-bueno` no cambiaron en absoluto.
En su lugar, tanto `src/app/notificador/page.tsx` (server-side, sobre `cargasIniciales`) como
`panel-carga-archivo.tsx` (client-side, sobre `misCargas` tras cada refresh) filtran las
combinaciones a mostrar excluyendo cualquiera donde ya exista una carga `APROBADA` para ese
`ventanaCargaId` — una condición calculada en cada lectura, nunca un flag persistido. Esto evitó una
tabla nueva, una migración, un endpoint y un botón con su propio diálogo de confirmación.

**`ventanaCargaId` agregado a `CargaArchivoResumen`, sin migración.** La columna `ventana_carga_id`
ya existe en `carga_archivo`; el tipo de "resumen" (usado por "Mis cargas" y ahora también por el
filtro de arriba) la omitía a propósito. Se dejó de omitir en `SELECCION_RESUMEN`/
`aCargaArchivoResumen` (`PrismaCargaArchivoRepository.ts`). Alternativa descartada: emparejar por
`(formatoExcelId, anio)` en vez de `ventanaCargaId` — funciona en el caso normal, pero confundiría
una ventana eliminada y recreada para el mismo año+formato (posible por el índice único parcial
`WHERE eliminadaEn IS NULL` de RF-15) con la ventana vigente.

**Tabla "Intentos fallidos" por sección, sin consulta nueva al repositorio.** Se deriva en el
cliente filtrando el mismo arreglo `misCargas` ya cargado para "Mis cargas"
(`m.ventanaCargaId === combinacion.ventanaCargaId && m.estado === "CON_ERRORES"`), en vez de agregar
un filtro nuevo a `FiltroListadoCargasPropias`/una consulta por combinación. Enlaza a la página de
detalle nueva envuelto en `<ViewTransition>` (mismo patrón que el enlace "Detalle" de
`TablaVentanasCarga`).

**Página de detalle de una carga propia (`/notificador/cargas/[id]`), primera para este perfil.**
ADMIN/REVISOR ya tenían `/dashboard/cargas/[id]`/`/revisor/cargas/[id]`; el notificador no tenía
ninguna (el endpoint `GET /api/notificador/cargas/[id]` existía pero ningún componente lo consumía).
`src/app/notificador/cargas/[id]/page.tsx` sigue el mismo patrón: Server Component,
`obtenerCargaPropia(id, usuarioId)`, `notFound()` uniforme si no existe o no es del actor (mismo
criterio de no distinguir ambos casos ya usado en el endpoint). `shared/components/DetalleCargaPropia.tsx`
reutiliza `ResumenErroresCarga` sin cambios de lógica, envuelto en `<ViewTransition>`.

**Primera generación de un `.xlsx` de salida en el proyecto.** Hasta ahora `exceljs` solo se usaba
para *leer* (plantillas de RF-13, archivos de reporte de RF-14). El endpoint nuevo
`GET /api/notificador/cargas/[id]/errores` genera un Excel de descarga con las mismas columnas que
`ResumenErroresCarga` (Fila, Columna, Tipo de error, Mensaje), detrás de un puerto nuevo
`GeneradorExcelErrores` (`modules/reporte-excel/application/ports.ts`) implementado en
`infrastructure/generacion-excel/GeneradorErroresExcelJs.ts` — mismo criterio de puertos ya usado
por `LectorPlantilla`/`LectorArchivoReporte`, para que el Route Handler nunca importe `exceljs`
directamente. El generador solo recibe `ErrorCargaArchivo[]`, nunca el buffer del archivo original:
el `.xlsx` de errores no puede filtrar datos de celdas (nombres, RUTs, etc.) del reporte subido, ni
siquiera por accidente. Responde 404 uniforme en los tres casos posibles (no existe, no es del
actor, sin errores) — mismo criterio de no revelar cuál ocurrió que ya usa el resto de
`/api/notificador/`.

**`ETIQUETAS_TIPO_ERROR`/`etiquetaFila` y `ETIQUETAS_ESTADO` extraídos a `shared/utils/`.** Antes
vivían declarados dentro de `ResumenErroresCarga.tsx` y `panel-carga-archivo.tsx` respectivamente,
sin reutilización. Al necesitar las mismas etiquetas también en `GeneradorErroresExcelJs.ts` y
`DetalleCargaPropia.tsx`, se movieron a `shared/utils/erroresCargaArchivo.ts` y
`shared/utils/estadoCargaArchivo.ts`: un único lugar por concepto evita que la tabla en pantalla, el
Excel descargable y el detalle diverjan en el texto mostrado para el mismo dato.

## Alertas por email a notificadores (RF-17)

Alertas por email a notificadores NOTIFICADOR_RPC que no han reportado su archivo en una ventana de
carga, configurable por ventana, con envío automático (scheduler en proceso) y manual (masivo o
individual), plantilla HTML enriquecida editable, e historial de envíos agrupado por lotes.

### Sanitización en dos etapas, no una

`modules/ventanas-carga/domain/entities/PlantillaAlerta.ts` sanea el HTML dos veces, con criterios
distintos, porque son dos superficies distintas:

* **Guardado** (`sanitizarPlantillaAlertaHtml`): el HTML que produce el editor (plantilla de la
  ventana, o el mensaje editado en el modal individual antes de resolver placeholders). El único
  `<a href>` permitido es el marcador literal `{{enlaceSistema}}`; cualquier otro se degrada a
  `<span>` (conserva el texto, pierde el enlace) — nunca se descarta el nodo completo, para que un
  operador que pegó un enlace externo por error siga viendo el texto que escribió.
* **Envío** (`sanitizarMensajeResueltoHtml`): el mensaje ya con los placeholders resueltos,
  incluido el enlace convertido en la URL real. El único `href` permitido es exactamente esa URL,
  con `rel="noopener noreferrer"` agregado por el servidor. Es defensa en profundidad: cierra la
  ventana entre "lo que el editor pudo producir" y "lo que realmente se envía" — un valor de
  `mensaje` manipulado directamente vía la API (sin pasar por el editor) queda igual de acotado.

**Detalle de `sanitize-html` encontrado al probar, no documentado en su propia referencia:**
`transformTags` degradando un `<a>` a un tagName que NO está en `allowedTags` dejaba, en un
documento con dos transformaciones de `<a>` (una descartada, otra preservada), el HTML resultante
con las etiquetas de cierre desalineadas entre elementos hermanos (`<a href="...">texto</span>` en
vez de `</a>`) — no una vulnerabilidad de XSS (el contenido peligroso sigue fuera), pero sí HTML
inválido que podría romperse en un cliente de correo. La corrección fue agregar `span` a
`allowedTags` (sin atributos permitidos) para que el tagName de destino de la degradación sea un
tag reconocido y el manejo de la pila de tags de la librería no se desincronice entre hermanos.

### `resolverPlantillaAlerta`: escapar datos de usuario, no la URL que arma el servidor

Cada valor de `PLACEHOLDERS_PERMITIDOS` (`nombreUsuario`, `diasRestantes`, `formatoArchivo`,
`anio`) se escapa con `escaparHtml()` antes de interpolarse — son datos que, aunque hoy vienen de
la base y no directamente de un formulario, podrían contener caracteres con significado HTML
(un nombre con `&`, por ejemplo). El marcador `{{enlaceSistema}}` se reemplaza por la URL real SIN
escapar: es una cadena construida por el propio servidor (`AlertaVentanaMailer.construirUrlEnlaceSistema`),
no un dato de usuario.

### `escaparHtml`/`describirFalloEnvio` centralizados en `shared/utils/`

Ambas funciones vivían privadas dentro de `modules/auth/` (`PasswordResetMailer.ts` y
`RequestPasswordReset.ts` respectivamente, de RF-10). RF-17 las necesita desde
`modules/ventanas-carga/`, y `application/`/`domain/` de un módulo no puede importar
infraestructura o un caso de uso de otro módulo — se movieron a `shared/utils/escaparHtml.ts` y
`shared/utils/describirFalloEnvio.ts`, y `modules/auth/` pasó a importarlas desde ahí en vez de
declararlas de nuevo.

### El enlace al sistema es un puerto, no una función de infraestructura importada directamente

`EnviadorCorreoAlerta` (`modules/ventanas-carga/application/ports.ts`) expone
`construirUrlEnlaceSistema(): string` además de `enviar()` y `disponible()`. Los casos de uso de
envío (`EnviarAlertaMasivaVentana`, `EnviarAlertaIndividualVentana`, `EjecutarEnvioAutomaticoAlertas`,
`ObtenerVistaAlertasVentana`) necesitan esa URL para resolver la plantilla, pero `application/` no
puede invocar `infrastructure/` directamente (la URL se arma siempre desde `configSmtp.urlBase`,
nunca desde una cabecera de la petición, mismo criterio de seguridad que `PasswordResetMailer.ts`)
— por eso vive en el puerto, implementado por `infrastructure/email/AlertaVentanaMailer.ts`, no como
una función suelta importada desde `application/`.

### Deduplicación del envío automático: un índice único parcial, no una comprobación previa

`AlertaNotificacionVentana` tiene un índice único parcial agregado a mano en la migración
(`WHERE tipo = 'AUTOMATICA' AND resultado = 'EXITO'`, sobre `(ventanaCargaId, usuarioId,
fechaProgramada)`) porque Prisma no expresa `WHERE` en su DSL. `EjecutarEnvioAutomaticoAlertas`
igual consulta primero `listarUsuariosConEnvioExitoso` (una consulta por ventana, nunca una por
destinatario) para no intentar un envío que el índice de todas formas rechazaría; si una carrera
real ocurre entre dos ejecuciones del ciclo, `crearLote` usa `skipDuplicates: true` en el
`createMany`, que absorbe la colisión en silencio sin fallar el resto del lote.

### Reintento solo en el envío automático, con espera fija, persistiendo únicamente el resultado final

`enviarConReintento` (dentro de `EjecutarEnvioAutomaticoAlertas.ts`) reintenta hasta 3 veces con
2 segundos de espera entre intentos, y solo se persiste UNA fila por destinatario (el resultado del
último intento), nunca una fila por intento fallido. El envío manual (masivo o individual) no
reintenta: un clic del operador es un solo intento, con su resultado inmediato.

### Los envíos automáticos no se auditan en `logs/auditoria.txt`

A diferencia de los cuatro endpoints manuales (`VENTANA_CARGA_ALERTAS_CONFIGURADAS`,
`PLANTILLA_ALERTA_ACTUALIZADA`, `ALERTA_MASIVA_ENVIADA`, `ALERTA_INDIVIDUAL_ENVIADA`, auditados en
éxito y en los rechazos de negocio), el ciclo automático del scheduler no genera ningún evento de
auditoría: la propia tabla `alerta_notificacion_ventana` ya es su registro estructurado, con más
detalle del que cabría en una línea de auditoría. Solo un fallo del CICLO COMPLETO (no de un envío
puntual a un destinatario, que ya queda como fila `ERROR`) se registra, y en `logs/errores.txt` vía
`logger.error`, no en `auditoria.txt`.

### Scheduler en el mismo proceso, arrancado desde `instrumentation.ts`

`src/infrastructure/scheduler/schedulerAlertasVentanas.ts` sigue exactamente el patrón de guard de
`globalThis` de `src/infrastructure/database/prisma.ts` (una instancia por proceso, copia en
`globalThis` solo en desarrollo para sobrevivir al Fast Refresh sin registrar dos tareas cron).
`src/instrumentation.ts` (raíz de `src/`, no `app/`) exporta `register()`, filtrado por
`process.env.NEXT_RUNTIME === "nodejs"` porque `node-cron` es Node-only y `register()` también se
evalúa en el runtime Edge.

### Editor de texto enriquecido: Lexical, sin conflicto de peers

`shared/components/EditorTextoEnriquecidoLimitado.tsx` usa Lexical 0.50.0 (`lexical`,
`@lexical/react`, `@lexical/list`, `@lexical/link`, `@lexical/html`), que declara
`react: ">=18.x"` — se instaló sin ningún conflicto de peer dependency contra React 19.2.8, así que
no hizo falta el plan B (`contentEditable` + `execCommand`). Barra de exactamente 4 botones
(negrita, cursiva, lista con viñetas, "Enlace al sistema"); el botón de enlace siempre dispara
`TOGGLE_LINK_COMMAND` con el marcador fijo `MARCADOR_ENLACE_SISTEMA`, nunca un campo de texto
editable por el operador — si no hay selección activa, inserta el texto "Ingresa aquí" ya envuelto
en el enlace (`$createLinkNode` + `$createTextNode`, sin pasar por un `<a href>` con URL libre en
ningún momento). Serializa/deserializa como HTML (`$generateHtmlFromNodes`/`$generateNodesFromDOM`
de `@lexical/html`), nunca como el JSON interno de Lexical: lo único que persiste el servidor es
HTML, y ese HTML siempre pasa por `sanitizarPlantillaAlertaHtml` en `application/` antes de
guardarse — el editor no es una barrera de seguridad, solo la superficie de edición. "Restaurar
plantilla por defecto" fuerza un remount del editor (cambia la prop `key`) en vez de mutar su
estado interno: Lexical no expone una prop `value` controlada.

**`DOMParser` no existe durante el pase de servidor de un Client Component.** La carga del HTML
inicial NUNCA debe ir en `initialConfig.editorState` de `LexicalComposer`: ese callback lo ejecuta
React durante el render, incluido el pase de SSR que Next.js hace de cualquier Client Component
antes de hidratar (`"use client"` no exime de ese pase) — y `DOMParser` es una API exclusiva del
navegador. `CargarHtmlInicialPlugin` mueve ese parseo a un `useEffect` (que solo corre en el
cliente), dejando el editor nacer vacío en el pase de servidor. Se comprobó reproduciendo el pase
de SSR con `react-dom/server` fuera del navegador: con el HTML inicial en `initialConfig.editorState`
lanzaba `ReferenceError: DOMParser is not defined` en cada render de servidor (rompía la página de
detalle completa, no solo la sección de alertas); con el `useEffect`, el mismo render no lanza nada.

**`LinkNode.sanitizeUrl()` corrompe el marcador `{{enlaceSistema}}` a `https://{{enlaceSistema}}`,
tanto en el DOM visible como en el HTML exportado — no configurable desde fuera.** Comprobado
llamando directamente al `formatUrl()` exportado por `@lexical/link`: cualquier `url` de un
`LinkNode` que no empiece con un esquema reconocido (`http:`, `mailto:`, etc.), un `/`, un `#`, o
incluya `@`, se le antepone `https://` — y esa función corre SIEMPRE que el nodo se renderiza a DOM
(`createDOM`/`updateDOM`, usados tanto por el editor visible como por `exportDOM`, que
`$generateHtmlFromNodes` invoca internamente). El estado interno del nodo (`getURL()`) queda
intacto; solo lo que se VE y lo que se EXPORTA se corrompe. Como no hay ninguna opción pública del
plugin de enlaces para desactivar esta normalización, la corrección vive en dos puntos de
`EditorTextoEnriquecidoLimitado.tsx`: `corregirMarcadorEnlaceHtml()` deshace la corrupción en el
HTML que sale hacia `onChangeHtml` (antes de llegar al servidor), y `CorregirEnlaceSistemaPlugin`
(`registerMutationListener(LinkNode, ...)`) la corrige también en el DOM visible del editor, para
que el operador nunca vea el marcador con el prefijo agregado. **Sin ninguna de las dos
correcciones, el sistema seguía siendo seguro** (verificado): `sanitizarPlantillaAlertaHtml`
compara el `href` con igualdad EXACTA contra `MARCADOR_ENLACE_SISTEMA`, así que un
`href="https://{{enlaceSistema}}"` corrompido no calza y se degrada a `<span>` igual que cualquier
otro enlace no autorizado — el bug rompía la FUNCIÓN (el enlace se perdía en cada guardado hecho
desde el editor), nunca abrió una vía de bypass de la sanitización.

### `useAccionConfirmable` extraído a `shared/hooks/`

Vivía privado dentro de `TablaVentanasCarga.tsx` (eliminar/publicar/archivar). RF-17 lo reutiliza
en `TablaNotificadoresPendientesVentana.tsx` para el envío masivo; se movió a
`shared/hooks/useAccionConfirmable.ts` sin cambiar su comportamiento, y `TablaVentanasCarga.tsx`
pasó a importarlo desde ahí. El envío individual usa estado propio (no este hook): el mensaje
editado en el modal solo se conoce al momento de confirmar, y no cabe en la forma de "un objetivo
fijo desde que se solicita" del hook genérico.

## "Mis cargas" del notificador: histórico de exitosas (RF-18)

`/notificador/cargas`, enlazada desde el menú lateral (`nav-enlaces.ts`), reemplaza la sección "Mis
cargas" que vivía al final de Inicio. Cambia de alcance: antes listaba toda `CargaArchivo` propia sin
filtrar, ahora solo `estado = APROBADA` (decisión explícita del usuario) — `CON_ERRORES` sigue en
"Intentos fallidos" y `PENDIENTE_VISTO_BUENO` sigue en Inicio, ninguno de los dos se tocó. Sin
migración de Prisma (todo el dato ya existía en `CargaArchivo`) ni endpoint `/api/` nuevo (Server
Component puro sobre el repositorio, mismo criterio que RF-15/RF-16).

### Reemplazo derivado en lectura, agrupado por `ventanaCargaId`

Igual que RF-16 documentó para el tablero de seguimiento, `CargaArchivo` no tiene restricción de
unicidad sobre `(usuarioId, ventanaCargaId)`: un notificador puede tener varias `APROBADA` para la
misma ventana (correcciones sucesivas). No existe ningún flag "reemplazada" persistido — se deriva
en `agruparCargasAprobadasPorVentana()` (`domain/entities/CargaArchivo.ts`): agrupa por
`ventanaCargaId`, y entre las que comparten grupo, la de mayor `vistoBuenoEn` es la vigente (fila
principal) y el resto quedan como reemplazadas, listadas como historial anidado (`<details>` dentro
de la misma fila, mismo patrón accesible que `/dashboard/logs`) — nunca como filas sueltas en la
tabla principal. La función asume que `cargas` ya llega ordenado `vistoBuenoEn desc` desde
`CargaArchivoRepository.listarPropiasAprobadas` (`take: 500` como tope defensivo documentado, no un
límite accidental) y depende de que toda fila `APROBADA` tenga `vistoBuenoEn` no nulo — cierto hoy
porque el único camino a `APROBADA` es `darVistoBueno()`, que setea ambos atómicamente; si esa
invariante cambiara, el `ORDER BY ... DESC` de Postgres coloca los `NULL` primero (`NULLS FIRST` por
defecto), lo que colaría una fila sin visto bueno como "vigente".

### Paginación de grupos, no de filas — y filtro acotado a la página cargada

`ListarCargasPropiasExitosas` pagina el arreglo de **grupos** (no las filas crudas) en memoria, con
el mismo contrato `{pagina, tamano, total, totalPaginas}` que `ListarCargasPropias`/
`ListarCargasAprobadas`: si paginara filas crudas, una reemplazada podría quedar separada de su
vigente por un corte de página. El filtro por formato de archivo y por año (decisión explícita del
usuario) se resuelve en cliente, sobre el arreglo de grupos ya cargado — mismo criterio de
simplicidad que el buscador de `TablaVentanasCarga` (RF-15). Limitación conocida y aceptada: como el
arreglo "ya cargado" es solo la página actual (25 grupos por defecto), el filtro no alcanza grupos de
otras páginas hasta navegar a ellas — aceptable porque el volumen esperado por notificador es bajo.

### Límite servidor/cliente de React: dos bugs reales encontrados en la verificación en navegador de esta entrega

`TablaMisCargasExitosas.tsx` necesita `"use client"` (filtros con `useState`/`useMemo`), a diferencia
de su componente de referencia `TablaCargasAprobadas.tsx` (Server Component puro, sin filtros). Esa
diferencia rompió dos veces el patrón que sí funciona en la referencia:

1. **Una función no-componente exportada de un módulo `"use client"` no es invocable desde un Server
   Component.** `ListadoMisCargasExitosas.tsx` (Server Component) llamaba a `aGrupoCargaExitosaVista`
   importada desde `TablaMisCargasExitosas.tsx` — al llevar esa segunda `"use client"`, la función
   queda del lado del cliente aunque sea una función pura sin JSX. Causaba 500
   (`Attempted to call aGrupoCargaExitosaVista() from the server but ... is on the client`). Se
   corrigió moviendo esa función (y sus tipos) a `shared/components/mis-cargas-exitosas.ts`, un
   módulo sin `"use client"` que ambos lados importan.
2. **Una función no se puede pasar como prop desde un Server Component hacia un Client Component**
   (salvo que sea una Server Action `"use server"`, no aplica aquí). `ListadoMisCargasExitosas.tsx`
   pasaba `rutaDetalle={(id) => \`/notificador/cargas/${id}\`}` a `TablaMisCargasExitosas` — causaba
   500 (`Functions cannot be passed directly to Client Components`). Se corrigió pasando un string
   (`rutaBase="/notificador/cargas"`) y construyendo el `href` final dentro del componente cliente.

Ninguno de los dos problemas existe en `ListadoCargasAprobadas.tsx`/`TablaCargasAprobadas.tsx`
porque ambos son Server Components — pasar funciones o exportar helpers entre dos Server Components
nunca cruza el límite serializable de RSC. La lección para el próximo componente que copie ese
patrón: si la tabla necesita interactividad de cliente, el mapeo dominio→vista y cualquier
constructor de ruta que el Server Component orquestador necesite invocar deben vivir en un módulo
aparte sin `"use client"`, y cualquier dato que cruce hacia el componente cliente debe ser serializable
(string/número/objeto plano), nunca una función.

## Publicación JSONB de cargas aprobadas + solicitudes de reemplazo (RF-19)

> **Desde RF-38 el visto bueno ya no copia las filas a `carga_archivo_publicada_fila`** (nadie las
> leía): solo crea la cabecera `carga_archivo_publicada`, que sigue sosteniendo "APROBADA vigente",
> el reemplazo y RF-33/RF-34. El dato publicado es el archivo, que se descarga con la columna "Fecha
> y hora de notificación". Las subsecciones siguientes sobre el detalle JSONB se conservan como
> registro de la decisión original. Ver "Archivos del notificador en disco… (RF-38)".

### Cabecera + detalle, no un array en una columna — porque se pidió explícitamente "cada fila es un registro"

La primera versión de este diseño guardaba `CargaArchivoPublicada.datos: Json` con un array de todas
las filas de la carga en una sola columna. El usuario pidió explícitamente que cada fila del
Excel/CSV fuera un registro de base de datos propio, así que el modelo final separa **cabecera**
(`CargaArchivoPublicada`: 1:1 con `CargaArchivo`, gobierna la visibilidad — `activo` — y el enlace de
reemplazo) de **detalle** (`CargaArchivoPublicadaFila`: una fila por cada fila real del archivo,
`@@unique([cargaArchivoPublicadaId, numeroFila])`). `valores` del detalle sigue siendo
`Json @db.JsonB`, no columnas SQL tipadas, por el mismo motivo que el resto del motor de validación
de RF-13/14 nunca usó columnas fijas: las columnas de un archivo las define el ADMIN por
`FormatoExcel` y varían de un formato a otro — una tabla de detalle con columnas SQL reales exigiría
una tabla por formato o un esquema EAV, que ningún otro módulo del proyecto usa hoy.

Ambas tablas se escriben en la MISMA transacción interactiva que ya hacía la transición
`PENDIENTE_VISTO_BUENO → APROBADA` (`PrismaCargaArchivoRepository.darVistoBueno`): el archivo se
reparsea con el mismo puerto `LectorArchivoReporte` de RF-14 (el contenido ya se leyó una vez al
subir, pero no se guardó fila por fila — solo se validó y descartó), y las filas se insertan con
`createMany` troceado en lotes de 5.000 (constante `TAMANO_LOTE_FILAS_PUBLICADAS`), nunca un `INSERT`
por fila. Como esta transacción ahora puede llegar a 4 lotes (`TOPE_FILAS_DATOS = 20_000` de RF-14)
más el resto de sus escrituras, se le pasa un `timeout: 15000` explícito — el valor por defecto de
Prisma (5000 ms) alcanza en localhost pero es un riesgo real fuera de él, señalado por el agente
`revisor` en la auditoría de esta entrega.

### Desactivar la publicación anterior: en el visto bueno del reemplazo, no al solo subir

Cuando una carga nace de un reemplazo consumido (`SolicitudReemplazoCarga.nuevaCargaArchivoId`
apunta a ella), su propio `darVistoBueno` —dentro de la misma transacción de arriba— además marca
`activo = false`, `reemplazadaEn`, `reemplazadaPorCargaArchivoId` y `motivoReemplazo` (copiado tal
cual desde `SolicitudReemplazoCarga.motivo`, sin volver a pedirlo) en la publicación de la carga
ANTERIOR. Se hace en el visto bueno de la carga nueva, no en el momento de subir el archivo de
reemplazo: si ese archivo sube con errores y nunca llega a `APROBADA`, la publicación original debe
seguir activa, porque el reemplazo nunca se concretó. Las filas de detalle de la publicación anterior
nunca se tocan (se conservan íntegras), solo dejan de ser visibles porque su cabecera quedó inactiva.

Sin backfill: las cargas ya `APROBADA` antes de esta entrega no tienen fila en
`CargaArchivoPublicada` (nunca se reparsearon retroactivamente, por el costo/riesgo de reprocesar
binarios antiguos en una migración) — limitación conocida y aceptada.

**Actualizado por RF-33:** el visto bueno desactiva **todas** las publicaciones activas de la misma
combinación (usuario, ventana) distintas de la aprobada, no solo la de la carga enlazada por la
solicitud. Así se mantiene la invariante "como mucho una publicación activa por combinación" aunque
la carga nueva haya llegado por una cadena de rechazos (sin solicitud enlazada). El motivo copiado es
el de la solicitud enlazada a la carga nueva; si no hay, el de la última solicitud consumida sobre la
vigente anterior (`obtenerUltimaUtilizadaPorCarga`); si tampoco hay, la constante genérica
`MOTIVO_REEMPLAZO_GENERICO`.

### "APROBADA vigente" y aprobaciones superadas (RF-33)

La carga APROBADA **vigente** de (usuario, ventana) es la más reciente por `vistoBuenoEn` cuya
publicación no esté desactivada (`publicacion IS NULL` —cargas sin backfill— o `activo = true`;
filtro compartido `FILTRO_APROBADA_NO_SUPERADA` en `PrismaCargaArchivoRepository`). No hay estado
`REEMPLAZADA` en el enum: la marca persistida de "superada" es `CargaArchivoPublicada.activo = false`
con `motivoDesactivacionTipo = REEMPLAZO`. Consecuencias:

* Una aprobación superada nunca vuelve a bloquear al notificador, aunque después se rechace la carga
  que la reemplazó (antes `obtenerAprobadaVigentePorUsuarioYVentana` la "revivía").
* No es rechazable: `rechazar()` usa el mismo filtro en su `updateMany` condicional y responde 409
  `NO_RECHAZABLE`. Si lo fuera, su rechazo crearía una reapertura posterior a la vigente y abriría un
  reemplazo que nadie pidió.
* En `TablaCargasVentana` (revisor y dashboard) se muestra con el badge derivado "Reemplazada"
  (`BadgeEstadoCarga` prop `superada`, etiqueta en `shared/utils/estadoCargaArchivo.ts`), sin acción
  "Rechazar"; la descarga se mantiene.
* `SolicitarReemplazoCarga` hereda la definición: pedir el reemplazo de una aprobación superada da
  `NO_ES_VIGENTE`.

Al 2026-10-02, la BD de desarrollo no tenía ninguna `APROBADA` sin publicación; si existiera alguna
más vieja que una aprobación posterior luego rechazada, volvería a contar como vigente.

### Autorización de reemplazo: se consume al FINALIZAR, no al subir (RF-33 revierte la decisión original de RF-19)

**Estado actual (RF-33).** La regla única vive en `application/resolverAutorizacionReemplazo.ts`, usada
por la subida (`ValidarYCargarArchivo`) y por el envío (`FinalizarYEnviarCarga`): sin APROBADA vigente
no hace falta autorización; con una vigente, se acepta (a) una `SolicitudReemplazoCarga` utilizable
sobre esa carga, o (b) una reapertura vigente cuyo `rechazadoEn` sea posterior al `vistoBuenoEn` de la
vigente (`reaperturaAutorizaReemplazo` / `rechazoPosteriorAAprobacion` en
`domain/entities/CargaArchivoRechazo.ts`, funciones puras que también usa el cliente). La condición
de fecha impide que una reapertura vieja sin consumir abra un reemplazo no autorizado; (b) cubre que
el revisor rechace la carga de reemplazo, o apruebe una solicitud `CARGA_PENDIENTE_DECISION` sobre
ella. Si existen ambas, se consume la solicitud.

La subida **no consume nada** (`crear()` volvió a ser una escritura anidada simple). La solicitud y
las reaperturas se consumen en `CargaArchivoRepository.finalizar()`, dentro de una transacción
interactiva: `updateMany` condicional de `finalizadaEn` → chequeo de otra pendiente finalizada de la
combinación → `marcarSolicitudUtilizadaEnTransaccion(tx, …)` (mutex `estado = APROBADA AND utilizadaEn
IS NULL`, exportada por `PrismaSolicitudReemplazoCargaRepository` fuera de la interfaz de dominio) →
reaperturas (la pendiente más reciente queda enlazada 1:1 a la carga, el resto solo recibe
`reaperturaConsumidaEn`). Los desenlaces de negocio se revierten lanzando el centinela
`RollbackFinalizar`; la carga se relee después del commit (`leerDetalleTrasEscritura`). Antes de la
transacción, `FinalizarYEnviarCarga` exige que la carga sea propia, `PENDIENTE_VISTO_BUENO` sin
finalizar y **el último intento** (`createdAt`) de su combinación (si no, 404 uniforme), revalida que
la ventana siga abierta y publicada o que haya reapertura vigente (`resolverVentanaHabilitada`, 400
`SIN_VENTANA_ABIERTA`) y revalida la autorización con un `ahora` fresco (409 `REEMPLAZO_NO_AUTORIZADO`).

Por qué se revirtió la decisión original (abajo): consumir al subir dejaba al notificador **sin
salida**. Un intento con errores, o un archivo válido cuyo modal se cerraba sin "Finalizar y
enviar", gastaba la autorización; la UI seguía ofreciendo la subida y el servidor la rechazaba. El
riesgo de "reintentos ilimitados" queda acotado por la vigencia de 5 días de la solicitud o el plazo
de la reapertura, y solo un envío finalizado la consume. Las solicitudes que el código anterior ya
había consumido se liberan con `npm run datos:liberar-solicitudes-reemplazo` (dry-run por defecto,
`-- --aplicar` para escribir).

Defensa en BD: índice único parcial `carga_archivo_pendiente_finalizada_key` sobre
`carga_archivo ("usuarioId", "ventanaCargaId") WHERE estado = 'PENDIENTE_VISTO_BUENO' AND "finalizadaEn"
IS NOT NULL` (migración `20261002153611_indice_unico_carga_pendiente_finalizada`). Con adapter-pg, la
violación llega como P2002 sin `meta.target`: se reconoce por el nombre del índice en
`meta.driverAdapterError.cause.originalMessage` (`esViolacionIndicePendienteFinalizada`) y solo esa se
traduce a `CARGA_PENDIENTE_DECISION`.

**Nota sobre `pg`:** leer relaciones anidadas (`include`/`select` relacional) dentro de una
transacción (de arreglo o interactiva) hace que Prisma 7.9 + adapter-pg lance consultas en paralelo
sobre la misma conexión y emita el aviso de deprecación "client.query() when the client is already
executing a query". Las transacciones de este repositorio devuelven solo ids o booleanos y los
listados paginados usan `Promise.all([findMany, count])` sin transacción.

**Decisión original de RF-19 (histórica, reemplazada por RF-33):**

`SolicitudReemplazoCarga` vive en un módulo propio, `modules/solicitudes-reemplazo/`, no dentro de
`reporte-excel/`, porque su ciclo de vida (pedir → aprobar/rechazar → consumir) es independiente del
de una carga y tiene su propio actor revisor. Un `NOTIFICADOR_RPC` con una carga `APROBADA` vigente
para `(usuarioId, ventanaCargaId)` no puede volver a subir un archivo para esa combinación
(`ValidarYCargarArchivo`, chequeo "barato primero" antes de leer el archivo) salvo que exista una
`SolicitudReemplazoCarga` con `estado = APROBADA`, sin usar, y dentro de los 5 días desde su
aprobación (`solicitudUtilizable(solicitud, ahora)`, `domain/entities/SolicitudReemplazoCarga.ts` —
calculado siempre contra un `ahora` generado en el servidor, nunca persistido como un estado
"EXPIRADA" propio ni contra `now()` de PostgreSQL, mismo patrón que
`TokenRecuperacion.expiraEn`/`VentanaCarga.estaAbierta`). Sin autorización vigente, rechaza con el
motivo nuevo `REEMPLAZO_NO_AUTORIZADO` — verificado en la Fase 3 de esta entrega con un `fetch()`
directo al endpoint sin pasar por la UI, confirmando que la regla vive en `application/` y no solo se
oculta en el cliente.

La autorización se marca consumida (`utilizadaEn`, `nuevaCargaArchivoId`) al SUBIR el archivo de
reemplazo, no al dársele visto bueno — decisión explícita para que un notificador no pueda acumular
intentos ilimitados con la misma aprobación (evita "solicitudes fantasma" reutilizables para siempre
mientras reintenta). Efecto colateral aceptado: si el primer archivo de reemplazo sube
`CON_ERRORES`, esa autorización ya se consumió y hay que pedir una solicitud nueva para reintentar
—confirmado como comportamiento intencional, no un bug, señalado explícitamente por el agente
`revisor` para que quede documentado como decisión y no como olvido.

### Escritura cross-módulo en `PrismaCargaArchivoRepository.crear()` — excepción puntual, no un patrón a repetir

**Resuelto en RF-33:** `crear()` ya no escribe en `solicitud_reemplazo_carga`. El consumo se movió a
`finalizar()` y pasa por `marcarSolicitudUtilizadaEnTransaccion(tx, id, nuevaCargaArchivoId)`,
exportada por el repositorio del módulo `solicitudes-reemplazo`, tal como proponía el último párrafo
de esta sección. Texto histórico:

Al crear la nueva `CargaArchivo` de un reemplazo, `crear()` necesita marcar la
`SolicitudReemplazoCarga` como consumida en la MISMA transacción atómica. La API de transacciones de
**array** de Prisma (`prisma.$transaction([...])`, la que usa `crear()`) no permite anidar ahí una
llamada a través de `SolicitudReemplazoCargaRepository` (de otro módulo) sin pasarle el
`Prisma.TransactionClient`, así que `crear()` termina escribiendo directo
(`tx.solicitudReemplazoCarga.updateMany(...)`, replicando a mano la condición `estado = 'APROBADA' AND
utilizadaEn IS NULL`) en una tabla que pertenece al módulo `solicitudes-reemplazo`. Esto es una
excepción real al flujo de dependencias documentado arriba ("un módulo puede depender de la interfaz
de otro, nunca de tablas ajenas desde infraestructura"), señalada por el agente `revisor` en la
auditoría de esta entrega — **no** es equivalente al precedente que se citó en el código
(`auditarCargaArchivo.ts` hace una *lectura* a través del repositorio público de `auth`, esto es una
*escritura* cruda sin pasar por ningún contrato del otro módulo). Se acepta por el volumen bajo
esperado del sistema. Si este patrón se necesita de nuevo en un módulo futuro, resolverlo agregando
un método al repositorio del otro módulo que reciba el `Prisma.TransactionClient` (p. ej.
`marcarUtilizadaEnTransaccion(tx, id, nuevaCargaArchivoId)`) en vez de repetir el acceso directo.

### Reemplazo de una carga `PENDIENTE_VISTO_BUENO` finalizada, vía rechazo de RF-20 (RF-22)

RF-14b dejó una combinación (formato, ventana) con una carga finalizada y sin decidir sin ninguna
acción disponible para el notificador: la tarjeta desaparecía del panel hasta que un tercero
decidiera. RF-22 le da la misma salida que a una carga `APROBADA` bloqueada (RF-19): pedir un
reemplazo. `SolicitudReemplazoCarga.origen` (`CARGA_APROBADA` | `CARGA_PENDIENTE_DECISION`) distingue
ambos caminos; lo resuelve siempre `SolicitarReemplazoCarga` mirando el `estado`/`finalizadaEn` de la
carga, nunca el cliente. La decisión de diseño clave es **no** introducir un flujo de reemplazo
paralelo: al **aprobarse** una solicitud con origen `CARGA_PENDIENTE_DECISION`
(`PATCH /api/dashboard/solicitudes-reemplazo/[id]`), el Route Handler reutiliza intacto el
`rechazarCarga()` de RF-20 sobre la carga original, con un motivo fijo generado por el sistema (no
editable por el revisor). Eso la deja `RECHAZADA` y dispara, sin código nuevo, el mismo mecanismo de
reapertura que ya usa un rechazo manual — `ValidarYCargarArchivo` deja de encontrarla vía
`obtenerPendienteFinalizadaPorUsuarioYVentana` y el notificador vuelve a subir por el camino de
`reaperturaVigente()` de siempre.

Dos matices de esta reutilización, no evidentes leyendo solo `RechazarCarga.ts`:

- **Dos escrituras separadas, sin transacción compartida** (mismo riesgo aceptado que RF-19): la
  aprobación de la solicitud y el rechazo de la carga original son dos llamadas distintas al
  repositorio. Si `rechazarCarga()` devuelve `{ ok: false }` después de que la aprobación ya se
  guardó, el Route Handler lo deja constando en `logs/errores.txt` y responde igual éxito de la
  revisión — no revierte la aprobación ya persistida. El estado inconsistente resultante (solicitud
  `APROBADA` pero carga original todavía sin decidir) requeriría intervención manual, igual que el
  equivalente ya aceptado en RF-19.
- **Un solo correo, no dos.** El notificador ya recibe el correo de "tu solicitud fue aprobada" de
  `SolicitudReemplazoMailer` (disparado desde el mismo Route Handler, como siempre). El Route Handler
  simplemente no vuelve a invocar `RechazoCargaMailer` en este camino — no hizo falta un flag nuevo en
  `rechazarCarga()`, porque el envío de ese correo nunca vivió dentro del caso de uso: vive en el
  Route Handler de `POST /api/dashboard/cargas/[id]/rechazo`, que es un punto de entrada distinto al
  de esta aprobación.

`CARGA_ARCHIVO_RECHAZADA` gana el campo `origenRechazo` (`DECISION_UNILATERAL` |
`REEMPLAZO_APROBADO`) para que el histórico de auditoría distinga un rechazo manual de siempre de
este efecto automático, sin ambigüedad con `estadoOrigenRechazo` (que ya existía, y sigue
respondiendo una pregunta distinta: de qué **estado de carga** venía el rechazo, no quién/qué lo
disparó).

### Fechas de ventana en hora de pared de Chile y plazos que vencen a las 23:59

`VentanaCarga.fechaApertura`/`fechaVencimiento` se guardan como **hora de pared de Chile escrita en
UTC**: "abre el 01-09" es `…-09-01T00:00:00.000Z` y "vence el 31-12" es `…-12-31T23:59:59.999Z`. No se
migraron los datos: ese mismo convenio lo usa la regla `FECHA_DENTRO_DE_VENTANA_VIGENTE` al comparar
las fechas del archivo (también de pared) contra la ventana, y se muestran con
`formatearFechaCalendario` (zona UTC).

El error era comparar esas fechas de pared contra instantes reales: la ventana cerraba a las 23:59
UTC, es decir, a las 20:59 en Chile (19:59 en horario de invierno), y abría a las 21:00 del día
anterior. Ahora toda comparación contra un instante real pasa por los helpers de
`shared/utils/fecha.ts`:

- `instanteAParedChile(instante)`: lleva `ahora` a hora de pared de Chile. Lo usan `estaAbierta()`,
  `listarDisponibles()` (en el `WHERE`), `calcularDiasRestantes()`,
  `calcularFraccionTiempoTranscurrido()` y `esDiaDeEnvioAutomatico()`.
- `paredChileAInstante(pared)`: el inverso. `fechaLimiteReapertura()` lo usa para devolver el
  vencimiento de la ventana como instante real, que luego se muestra con `formatearFechaHora`
  (31-12, 23:59).
- `finDelDiaChile(instante, dias)`: las 23:59:59.999 hora de Chile del día `instante + dias`. Los dos
  plazos de 5 días terminan así, no a la hora exacta del evento: la reapertura tras un rechazo con la
  ventana ya vencida (`DIAS_REAPERTURA_TRAS_VENCIMIENTO`) y la vigencia de una solicitud de reemplazo
  aprobada (`DIAS_VIGENCIA_SOLICITUD_APROBADA`).

El desfase se calcula con `Intl` en cada instante, así que respeta el cambio de horario de
verano/invierno de Chile, sin depender de la zona horaria del servidor.

### Un rechazo cierra las solicitudes de reemplazo pendientes de esa carga

Si un ADMIN/REVISOR_REPOSITORIO rechaza una carga que tiene una `SolicitudReemplazoCarga` todavía
`PENDIENTE`, esa solicitud queda sin sentido: el rechazo ya reabre la combinación para el
notificador. `PrismaCargaArchivoRepository.rechazar()` la cierra como `RECHAZADA` **dentro de la
misma transacción** del rechazo, con `revisadoPorId` = quien rechazó y un comentario fijo del
sistema, así que no queda colgando en la bandeja de revisión. Solo toca solicitudes `PENDIENTE`: en
el camino RF-22 la solicitud ya está `APROBADA` cuando se llama a `rechazar()`, y no se toca. Es una
escritura directa a la tabla de `solicitudes-reemplazo`, el mismo atajo cross-módulo que
`crear()` (ver deuda técnica en `docs/requerimientos.md`). No dispara correo ni evento de auditoría
propio: el evento del rechazo (`CARGA_ARCHIVO_RECHAZADA`) ya lo cubre.

En `/notificador`, el aviso de rechazo (`BannerReaperturaCarga`) enlaza con "Subir nuevo archivo" a
la tarjeta de subida de esa ventana, usando un ancla `idTarjetaVentana(ventanaCargaId)` compartida
por ambos componentes (una ventana tiene un único formato, así que su id basta).

## Rechazo de una carga aprobada + confirmación de aprobación por correo (RF-20)

A diferencia de RF-19 (el notificador pide, un tercero aprueba), acá el rechazo es una decisión
**unilateral** de un ADMIN o REVISOR_REPOSITORIO sobre una carga ya `APROBADA` — no hay "solicitud
pendiente" de por medio. Por esa diferencia de semántica, `CargaArchivoRechazo` es una entidad propia
en `modules/reporte-excel/domain/entities/CargaArchivoRechazo.ts` (1:1 con `CargaArchivo`), no una
reutilización de `SolicitudReemplazoCarga`.

**Transición de estado y publicación, atómicas.** `PrismaCargaArchivoRepository.rechazar()` hace, en
una única transacción interactiva: (1) `updateMany` condicionado a `estado = 'APROBADA'` (cierra la
ventana de carrera de un doble clic, igual criterio que `darVistoBueno`), (2) crea el
`CargaArchivoRechazo` con el motivo y quién rechazó, (3) desactiva la `CargaArchivoPublicada` de esa
carga. A diferencia de RF-19 (la publicación anterior se desactiva solo cuando se aprueba la carga de
reemplazo), acá la desactivación es inmediata, en el mismo instante del rechazo, sin esperar un
reingreso.

**Rename + discriminador explícito en `CargaArchivoPublicada`.** Los campos `reemplazadaEn`/
`motivoReemplazo` (pensados en RF-19 solo para reemplazo consentido) se renombraron a
`desactivadaEn`/`motivoDesactivacion` (migración `RENAME COLUMN` real, preserva los datos ya escritos
por RF-19) porque ahora dos eventos de negocio distintos los usan. Se agregó además un campo explícito
nuevo, `motivoDesactivacionTipo` (`REEMPLAZO` | `RECHAZO`), en vez de inferir el tipo por la presencia
o ausencia de `reemplazadaPorCargaArchivoId` — decisión explícita del usuario, para que ninguna
consulta futura dependa de esa inferencia.

**Reapertura individual, perezosa, sin cron.** El rechazo habilita al notificador dueño de la carga
(solo a él) a volver a subir para la misma combinación (formato, ventana). La vigencia se calcula
siempre en lectura contra un `ahora` recibido como parámetro (mismo patrón que
`TokenRecuperacion.expiraEn`, `VentanaCarga.estaAbierta`, `SolicitudReemplazoCarga.solicitudVencida`):

```
fechaLimite = (ventana.fechaVencimiento > rechazo.rechazadoEn)
  ? ventana.fechaVencimiento
  : rechazo.rechazadoEn + 5 días
reaperturaVigente = !rechazo.reaperturaConsumidaEn && ahora <= fechaLimite
```

Es decir: si la ventana todavía no había vencido al momento del rechazo, la reapertura dura lo mismo
que le quedaba a la ventana normal (sin plazo extra injustificado); si ya había vencido, se extienden
5 días desde el rechazo. `ValidarYCargarArchivo` consulta esta reapertura antes de rechazar por
`SIN_VENTANA_ABIERTA` cuando la ventana ya venció. **Desde RF-33** se consume
(`reaperturaConsumidaEn`/`reaperturaConsumidaPorCargaArchivoId`) al **finalizar y enviar** la carga
nueva, con la ventana abierta o cerrada, dentro de la transacción de `finalizar()` (ver "Autorización
de reemplazo" arriba). Un intento con errores ya no la gasta. Antes se consumía al subir, con o sin
error, en la misma transacción que creaba la `CargaArchivo`. Con la ventana abierta, una reapertura
cuyo rechazo es posterior a la APROBADA vigente también autoriza el reemplazo de esa vigente. El
banner `BannerReaperturaCarga` en `/notificador` deja de mostrarse al finalizar con éxito.

**Visibilidad.** Sección "Rechazadas" en el detalle de ventana (junto a "Cargas aprobadas",
`TablaCargasRechazadasVentana`/`ListadoCargasRechazadasVentana`) y en "Mis cargas" del notificador
(RF-18), mostrando el motivo. El rechazo es irreversible, mismo criterio que el visto bueno de RF-14.

**Endpoint único compartido.** `POST /api/dashboard/cargas/[id]/rechazo` (`exigirAdminORevisor()`),
invocado tanto desde `/dashboard` como desde `/revisor` — mismo patrón que
`/api/dashboard/solicitudes-reemplazo/[id]` de RF-19, en vez de duplicar la ruta bajo `/api/revisor/`.

**Confirmación de aprobación por correo, agregada al mismo trabajo.** Al dar visto bueno
(`DarVistoBueno.ts`, sin cambios de firma: el caso de uso sigue sin conocer SMTP), el Route Handler
`app/api/notificador/cargas/[id]/visto-bueno/route.ts` dispara, dentro de un `after()` posterior a la
respuesta 200, un correo de confirmación al notificador dueño y al "buzón compartido" de revisión.
La variable de entorno nueva `BUZON_COMPARTIDO_REVISOR_EMAIL` (`src/infrastructure/config/env.ts`) es
**opcional** (string vacío tratado igual que ausente): si está configurada, se envía un único correo a
esa dirección; si no, se envía individualmente a cada usuario activo con perfil `REVISOR_REPOSITORIO`
(`UsuarioRepository.listarActivosPorPerfil`, una sola consulta) — **nunca** en el mismo To/CC, para no
exponer el email de un revisor a otro. Un fallo de SMTP en cualquiera de los dos envíos va a
`logs/errores.txt` y nunca bloquea ni revierte el visto bueno ya persistido.

**Auditoría.** Nueva acción `CARGA_ARCHIVO_RECHAZADA` en `logs/auditoria.txt` (éxito y rechazos
404/409; el 400 de motivo vacío no se audita, mismo criterio del resto del proyecto). El texto libre
del motivo nunca se registra, solo metadatos estructurados (`cargaArchivoId`, `usuarioObjetivoId` =
dueño de la carga, `actorId`/`actorRut`/`actorPerfil`, `ip`, `userAgent`) — mismo criterio que
`motivo`/`comentarioRevision` de RF-19.

**Migraciones.** `20260923090000_agregar_estado_rechazada_carga` agrega el valor de enum `RECHAZADA`
en su propia migración (PostgreSQL no permite usar un valor de enum recién creado en la misma
transacción que lo agrega); `20260923090100_agregar_rechazo_carga_archivo` crea `carga_archivo_rechazo`
y aplica el rename + `motivoDesactivacionTipo` (con backfill `REEMPLAZO` para las filas ya existentes).

## Fin de la autoaprobación del notificador: aprobación/rechazo por ADMIN/REVISOR_REPOSITORIO (corrección de RF-14)

RF-14 nació con una autoaprobación: el mismo notificador que subía un archivo sin errores le daba su
propio "visto bueno" (`POST /api/notificador/cargas/[id]/visto-bueno`, caso de uso `DarVistoBueno`),
sin que ningún tercero revisara la decisión. Se corrigió: la aprobación real pasa a ser una decisión
de ADMIN o REVISOR_REPOSITORIO, ejercida desde la misma tabla del detalle de ventana que ya tenía la
acción "Rechazar" de RF-20.

**El paso del notificador ya no aprueba, solo envía.** El botón "Dar visto bueno" se renombró a
**"Finalizar y enviar"** (`POST /api/notificador/cargas/[id]/finalizar`, reemplaza al endpoint
anterior, eliminado sin alias — caso de uso `FinalizarYEnviarCarga`). Este paso marca `finalizadaEn
= now()` en la `CargaArchivo` (columna nueva) **sin cambiar `estado`**: una carga sigue en
`PENDIENTE_VISTO_BUENO`, que ahora significa "enviada, pendiente de que un tercero decida" en vez de
"pendiente de que el propio notificador se autoapruebe". El `WHERE` del `updateMany` en
`PrismaCargaArchivoRepository.finalizar()` exige `{ id, usuarioId, estado: "PENDIENTE_VISTO_BUENO",
finalizadaEn: null }`, cerrando ownership y evitando una doble finalización en la misma llamada.

**Bloqueo de nuevas subidas mientras hay una decisión pendiente.** El mecanismo principal es de UI:
`panel-carga-archivo.tsx` filtra `combinacionesVisibles` para ocultar por completo la tarjeta de
cualquier combinación (formato, ventana) con una carga finalizada sin decidir — sin ningún mensaje de
bloqueo (decisión explícita del usuario: la persona ya sabe que envió algo, no hay nada que explicar).
`ValidarYCargarArchivo` blinda lo mismo en servidor, como defensa de segunda línea (nunca confiar
solo en que el cliente no llame la API directo): rechaza con el motivo `CARGA_PENDIENTE_DECISION` si
`obtenerPendienteFinalizadaPorUsuarioYVentana` encuentra una carga finalizada sin decidir para esa
combinación, verificado ANTES de leer el archivo (barato primero).

**`darVistoBueno()` ya no valida ownership del actor.** Antes exigía `carga.usuarioId === actorId`
(el mismo notificador). Ahora exige `estado === "PENDIENTE_VISTO_BUENO" && finalizadaEn !== null` y
recibe `aprobadoPorId` explícito (quien realmente aprueba, para `vistoBuenoPorId`) — cualquier ADMIN
o REVISOR_REPOSITORIO puede aprobar cualquier carga, sin restricción de autoría, mismo criterio
simétrico ya usado en `RechazarCarga`. Al aprobar se reutiliza intacta la publicación JSONB (RF-19)
y el correo de confirmación ya existente (RF-20, `VistoBuenoCargaMailer`, disparado en `after()`
desde el nuevo endpoint `POST /api/dashboard/cargas/[id]/aprobacion`, mismo patrón que
`.../rechazo`: `exigirAdminORevisor()`, compartido entre `/dashboard` y `/revisor`).

**"Rechazar" se extiende para aceptar dos orígenes.** `PrismaCargaArchivoRepository.rechazar()` lee
el `estado` previo con un `findUnique` DENTRO de la misma transacción interactiva, antes del
`updateMany` (que ahora acepta `estado: { in: ["APROBADA", "PENDIENTE_VISTO_BUENO"] }`, esta última
solo con `finalizadaEn` no nulo), y solo desactiva la `CargaArchivoPublicada` cuando el origen leído
era `APROBADA` — una `PENDIENTE_VISTO_BUENO` nunca llegó a publicarse, así que ese paso se omite sin
error. La reapertura para el notificador (`CargaArchivoRechazo`, vigencia perezosa de RF-20) se
genera igual para ambos orígenes, sin condicional: no depende de si la carga alcanzó a aprobarse.

**UI unificada.** La tabla "Cargas aprobadas" (`TablaCargasVentana.tsx`) se renombra a
**"Notificaciones de archivos pendientes de aprobación o rechazo"** (título y `<caption>`) y pasa a
listar tanto `PENDIENTE_VISTO_BUENO` (finalizada) como `APROBADA` de la ventana, con una columna
"Estado" nueva. Acciones: una fila `PENDIENTE_VISTO_BUENO` muestra "Aprobar" (confirmación simple,
sin motivo) y "Rechazar" (con motivo); una fila `APROBADA` muestra solo "Rechazar".

**Migración y datos existentes.** `20260923120000_agregar_finalizadaEn_carga_archivo` agrega
`finalizadaEn DateTime?` a `carga_archivo` y, en la MISMA migración transaccional, hace
`UPDATE carga_archivo SET "finalizadaEn" = "createdAt" WHERE estado = 'PENDIENTE_VISTO_BUENO' AND
"finalizadaEn" IS NULL` — decisión explícita del usuario: toda carga en ese estado antes de esta
corrección se subió bajo el sistema viejo (sin el paso de "Finalizar y enviar"), así que se trata
como ya finalizada, para que quede inmediatamente disponible para que ADMIN/REVISOR_REPOSITORIO la
decida sin que el notificador tenga que hacer nada retroactivo.

**Auditoría.** Nuevas acciones `CARGA_ARCHIVO_FINALIZADA` (paso del notificador) y
`CARGA_ARCHIVO_APROBADA` (decisión de un tercero). `CARGA_ARCHIVO_VISTO_BUENO` se conserva en el
tipo `AccionAuditoria` solo para poder leer el histórico ya escrito antes de esta corrección
("no usar en eventos nuevos" — mismo criterio que otros campos legacy del proyecto, p. ej.
`actorRol`/`rolAnterior` de la época pre-RF-09) — ningún código nuevo la emite. `CARGA_ARCHIVO_RECHAZADA`
gana un campo opcional `estadoOrigenRechazo` (`PENDIENTE_VISTO_BUENO` | `APROBADA`) para que el
histórico distinga de qué estado vino cada rechazo, ahora que puede ser cualquiera de los dos.

## Mensajería entre revisor y notificador (RF-31)

### Modelo: un hilo por notificador, cada mensaje etiquetado con su carga

`mensaje_carga` guarda `cargaArchivoId`, `ventanaCargaId` (copia denormalizada de la carga),
`notificadorId` (clave del hilo, copia de `carga.usuarioId`), `autorId`, `ladoAutor`
(`REVISOR`|`NOTIFICADOR`, persistido al escribir porque el perfil del autor puede cambiar),
`contenido` `VarChar(1000)`, `creadoEn` y `leidoEn`. Denormalizar ventana y notificador (que nunca
cambian en una carga) permite contar no leídos por ventana con `groupBy` de Prisma, sin `$queryRaw` ni
JOIN. Un CHECK manual en la migración exige `ladoAutor <> 'NOTIFICADOR' OR autorId = notificadorId`.
Índices: `[notificadorId, ventanaCargaId, creadoEn]` (hilo y resumen del notificador),
`[ventanaCargaId, ladoAutor, leidoEn]` (alertas del revisor) y `[autorId]` (EXISTS de historial y FK).

### Bandeja compartida: un solo `leidoEn` por mensaje

`leidoEn` es la lectura del lado contrario al autor. Del lado revisor no hay estado por persona: lo
que lee un revisor queda leído para todos, porque la bandeja es del equipo. La marca de lectura recibe
`hasta` (fecha del último mensaje que el cliente mostró) y solo afecta `creadoEn <= hasta`, para no
marcar como leído un mensaje que llegó entre el GET y el POST.

### Quién puede escribir y a qué carga se asocia (siempre en el servidor)

* Revisor, desde la fila de la carga: `POST /api/revisor/mensajes` exige carga `PENDIENTE_VISTO_BUENO`
  finalizada (409 `NO_PENDIENTE`).
* Revisor, en una conversación existente (`POST .../conversaciones/[notificadorId]/mensajes`): se
  permite aunque la carga ya se haya decidido (decisión del usuario); se asocia a la carga pendiente si
  existe, si no a la del último mensaje del hilo. Sin mensajes → 409 `SIN_CONVERSACION`.
* Notificador: nunca inicia; responde solo si hay mensajes del revisor en su hilo de esa ventana, y su
  respuesta se asocia a la carga del último mensaje del revisor.
* El chequeo de "pendiente" y el INSERT no van en transacción `Serializable`: un mensaje guardado
  milisegundos después de una aprobación concurrente no causa daño.

### Guards: `exigirRevisor()` es nuevo y excluye a ADMIN

`/api/revisor/**` (prefijo nuevo) usa `exigirRevisor()`, distinto de `exigirAdminORevisor()`: ADMIN
recibe 403 porque no participa de la mensajería. En la UI, `permiteMensajes` (true en
`/revisor/ventanas-carga/[id]`, false en `/dashboard/...`) oculta el botón, pero es solo comodidad. El
notificador accede a su hilo con la propiedad fijada en el WHERE (`notificadorId = sesion.sub`): pedir
otra ventana devuelve una lista vacía. El GET del hilo del revisor responde 404 si el par (notificador,
ventana) no tiene mensajes ni carga pendiente finalizada, para no exponer datos de un usuario cualquiera.

### Correo como caso de uso, una vez por tanda y por ventana

`AvisarMensajeNuevo` (contra el puerto `EnviadorAvisoMensajeNuevo`) decide si se envía: no si el correo
no está disponible ni si la cuenta no existe o está inactiva. El Route Handler lo invoca con `after()` y
registra un fallo en `logger.error`: el mensaje ya está guardado y el 201 no depende del SMTP.
Anti-ráfaga: se envía solo si, antes de este mensaje, el notificador no tenía mensajes del revisor sin
leer **en esa misma ventana** (un mensaje olvidado en otra ventana no bloquea los avisos nuevos). El
correo nunca lleva el contenido.

### UI: refresco sin tiempo real, y la carrera "cerrar antes de marcar leído"

Los avisos de las tarjetas los calcula el servidor (props, nunca copiadas a `useState`) y se actualizan
con `router.refresh()` al cerrar el modal. Se encontró en la verificación en navegador una carrera: si
el modal se cierra mientras el POST de lectura sigue en vuelo (frecuente en dev, por la compilación bajo
demanda de la ruta), el refresco renderiza el mensaje aún como no leído y el aviso queda pegado.
`shared/hooks/useRefrescoTrasLecturas.ts` hace que el refresco del cierre espere a los POST de lectura
en curso. Mientras el modal está abierto, `shared/hooks/useRefrescoPeriodico.ts` consulta cada 20 s con
la pestaña visible y de inmediato al volver a ella; los modales fusionan mensajes por `id`, para que una
respuesta de sondeo iniciada antes de un envío no haga desaparecer el mensaje recién enviado. Los
modales se montan solo mientras están abiertos (estado limpio en cada apertura). En `/revisor`, el
`groupBy` de totales se acota a las ventanas con tarjeta; el de no leídos no, porque el banner de
ventanas cerradas lo necesita.

## Perfil propio, cambio de contraseña, invalidación de sesión y bloqueo progresivo de cuentas (RF-21)

### La sesión JWT deja de ser puramente stateless: `verificarSesion()` ahora consulta BD

Hasta esta entrega, `verificarSesion()` (`modules/auth/infrastructure/auth/JwtService.ts`) validaba
un token solo con criterios LOCALES: firma, expiración y forma de los claims (`sub`, `perfil`). Nunca
tocaba la base de datos, así que el costo de autenticar una petición era constante y no dependía de
Postgres estar disponible. Esa propiedad se pierde a partir de aquí: el token ahora lleva un tercer
claim, `sesionVersion`, y `verificarSesion()` lo compara contra `usuario.sesionVersion` en la base
antes de dar el token por válido. Es el mismo mecanismo de invalidación que el renombre del claim
`perfil` de RF-09 (ver más arriba), pero MÁS FINO: en vez de invalidar todas las sesiones del sistema
de una vez, invalida las de una cuenta puntual, en el momento en que:

* la propia persona cambia su contraseña (`cambiarContrasenaPropia`, autoservicio de esta entrega),
* un administrador la fija manualmente para un tercero (`restablecerContrasena`, RF-16), o
* la persona consume un enlace de contraseña (`PrismaPasswordResetTokenRepository.consumir`, RF-10/RF-13).

Los tres caminos incrementan `usuario.sesionVersion` en la MISMA transacción que escriben el hash
nuevo (dos de ellos ya comparten `PrismaUsuarioRepository.actualizarContrasena`; el consumo del
enlace replica el incremento en su propia transacción de `modules/auth/`, documentado con un
comentario cruzado en ambos archivos: si se cambia uno, revisar el otro).

**Costo aceptado:** cada verificación de sesión (proxy, Route Handlers, Server Components que llaman
`obtenerSesionActual()`) hace ahora una consulta `SELECT sesionVersion FROM usuario WHERE id = ...`,
envuelta en `cache()` de React para deduplicarla dentro del mismo render/petición. Esa memoización
solo opera dentro de un scope de render de Next (Server Components, Route Handlers); llamada desde
`src/proxy.ts` (que no es una función de render de React) `cache()` no dedupe nada — cada llamada
ejecuta la consulta— pero tampoco hay riesgo de fuga entre peticiones de usuarios distintos: sin un
scope de render activo, React no memoiza en absoluto (se verificó empíricamente, ver commit de esta
entrega), así que el peor caso es una consulta de más por petición, nunca un valor cacheado servido
a la sesión equivocada.

**Efecto colateral aceptado (igual que RF-09):** desplegar la columna `sesionVersion` invalida, una
única vez, TODAS las sesiones activas del sistema — todo JWT emitido antes de este cambio no trae el
claim, así que la comprobación de forma en `verificarSesion()` ya lo descarta sin necesidad de ir a
la base.

**Limitación que se mantiene:** cambiar el PERFIL de una persona o desactivar su cuenta (`activo`)
sigue sin invalidar su sesión — solo un cambio de `contrasenaHash` la invalida. La limitación de RF-09
("cambiar el perfil no surte efecto hasta que el token expira, máximo 8 horas") sigue vigente para
esos dos casos; esta entrega solo cierra la ventana para el cambio de contraseña.

### Bloqueo progresivo de cuentas por intentos fallidos de login

Dos contadores en `Usuario`/`User`, con semántica deliberadamente distinta:

* `intentosFallidos`: fallos CONSECUTIVOS del ciclo actual. Se resetea a 0 en un login exitoso Y al
  activarse un bloqueo nuevo (arranca un ciclo nuevo desde cero).
* `vecesBloqueada`: cuántas veces la cuenta ha sido bloqueada en TODA su historia. Es monotónico de
  por vida — nunca se resetea, ni con un login exitoso ni con un desbloqueo manual del administrador
  — y determina la duración del PRÓXIMO bloqueo: `DURACIONES_BLOQUEO_MINUTOS = [1, 3, 5, 15]`
  (`modules/auth/domain/entities/User.ts`), indexado por `vecesBloqueada` con techo en el último
  valor (una cuenta bloqueada 10 veces sigue bloqueándose 15 minutos, no más).

**Por qué es una sola sentencia SQL cruda.** `registrarIntentoFallido()` (`PrismaUserRepository.ts`)
necesita, atómicamente, decidir "¿este intento llega al máximo?" y si es así incrementar
`vecesBloqueada` Y calcular `bloqueadaHasta` a partir del NUEVO valor de `vecesBloqueada`, todo contra
el estado que la fila tiene en ESE instante. Expresarlo con el API tipado de Prisma exigiría leer la
fila, decidir en JavaScript y escribir en una sentencia aparte — una ventana de carrera entre dos
peticiones de login simultáneas contra la misma cuenta (mismo motivo ya documentado para
`PrismaPasswordResetTokenRepository.consumir()` en RF-10). El `UPDATE ... CASE ... RETURNING` corre
como una única sentencia, indivisible por definición.

**Por qué la cuenta bloqueada no se toca de nuevo mientras dura el bloqueo.** `LoginUser.ts` revisa
`cuentaBloqueada(usuario, ahora)` ANTES de verificar la contraseña. Si ya está bloqueada, no llama a
`registrarIntentoFallido`: sumar un intento más durante el bloqueo no aporta nada y arriesgaría, al
vencer el bloqueo, arrancar el próximo ciclo con un conteo ya adelantado. La verificación de
contraseña contra `HASH_RELLENO` igual se ejecuta, por el mismo motivo de tiempo constante que el
resto de las ramas de fallo de este caso de uso (anti-enumeración).

**Por qué el mensaje de bloqueo se arma en el Route Handler y no en el caso de uso.** Mismo criterio
que `MENSAJE_ERROR_GENERICO`: `LoginUser.ts` devuelve datos (`bloqueadaHasta`), no texto. El cálculo
de minutos restantes usa el mismo `ahora` que ya viajaba como parámetro al caso de uso, para que el
número mostrado sea consistente con el que decidió si había o no bloqueo (nunca `new Date()` una
segunda vez). La respuesta HTTP sigue siendo 401 (no se introdujo 423) y con el mismo shape
`{ error: string }` que el resto de los fallos de login.

**Desbloqueo manual.** `DesbloquearUsuario.ts` (mantenedor de usuarios) limpia
`intentosFallidos`/`bloqueadaHasta` pero DELIBERADAMENTE no toca `vecesBloqueada`: un desbloqueo
manual no debe reiniciar la progresión de duraciones, o el administrador podría usarlo para resetear
a una cuenta comprometida de vuelta al bloqueo de 1 minuto indefinidamente. Auditado con
`CUENTA_DESBLOQUEADA`, incluyendo el caso `SIN_EFECTO` (el bloqueo ya había vencido solo) — mismo
criterio que los `SIN_EFECTO` de RF-10: un camino que hacia afuera es indistinguible del éxito debe
dejar rastro igual.

### `logs/accesos.txt` (RF-07): versión mínima

Se implementa en esta entrega el logger y la función `registrarAcceso()`
(`infrastructure/logging/accesos.ts`), con el esquema de campos ya definido en `CLAUDE.md`, conectado
desde `app/api/auth/login/route.ts`. El motivo `usuario_inactivo` queda declarado en el tipo
`EventoAcceso` pero esta entrega no lo emite: `LoginUser.ts` colapsa "RUT inexistente", "cuenta
pendiente de activación" y "cuenta inactiva" en un único motivo interno `CREDENCIALES_INVALIDAS`
(mismo criterio anti-enumeración que el resto del caso de uso, ninguna de esas tres situaciones debe
ser distinguible desde afuera), así que no hay una señal que distinguir hacia el log tampoco. Separar
esas ramas en `LoginUser.ts` para poblar `usuario_inactivo` queda fuera de esta entrega.

### Patrón de UI nuevo: "menu button" (WAI-ARIA) para el menú de configuración de la cuenta

`MenuConfiguracionUsuario.tsx` (montado en `EncabezadoPanel`, que gana la prop `rutaBase` para
enlazar a `${rutaBase}/perfil` y `${rutaBase}/perfil/contrasena`) es el primer menú desplegable
propiamente dicho del proyecto: hasta ahora no existía ningún patrón `role="menu"`. Se implementó el
patrón "menu button" de la WAI-ARIA Authoring Practices en vez de `<details>/<summary>` (usado en
otras partes del proyecto para contenido colapsable) porque `<details>` no expone semántica de menú
a un lector de pantalla ni permite mover el foco al primer ítem al abrir — ambos comportamientos
esperables de un menú de acciones. Estado local con `useState` (no Zustand: nada de este menú se
comparte entre componentes); cierre con Escape, cierre al clic fuera (listener en `document`, no en
el contenedor) y devolución de foco al botón disparador al cerrar, igual que la trampa de foco nativa
que ya usa `DialogoConfirmacion` con `<dialog>`. Cualquier menú desplegable nuevo del proyecto debería
seguir este mismo patrón en vez de introducir uno distinto.

## Vigencia de reemplazo configurable por ventana (RF-36)

Las secciones anteriores de RF-19, RF-20, RF-22 y RF-33 hablan de **5 días fijos**. RF-36 los
reemplaza; esas secciones se conservan como registro de la decisión original.

### Una sola fórmula para solicitudes aprobadas y reaperturas por rechazo

`fechaVencimientoAutorizacion()` (`modules/ventanas-carga/domain/entities/VentanaCarga.ts`) es la
única fuente del plazo:

```
venceEl = max(ventana.fechaVencimiento, finDelDiaChile(fechaDecision + N días))
```

- Si al decidir la ventana sigue vigente, la autorización dura al menos hasta su cierre.
- Si ya venció, dura N días desde la decisión, hasta las 23:59:59.999 hora de Chile.

Antes, una solicitud aprobada (RF-19/RF-33) y una reapertura por rechazo (RF-20/RF-22) tenían
constantes separadas, ambas en 5. Unificarlas evita que dos caminos de "puedes volver a subir" den
plazos distintos para la misma ventana.

### N se copia al decidir, no se lee de la ventana en cada lectura

`ventana_carga.diasVigenciaReemplazo` (1 a 90, por defecto 7) se copia en el registro que otorga la
autorización: `solicitud_reemplazo_carga.diasVigencia` al aprobar y
`carga_archivo_rechazo.diasReapertura` al rechazar. Así, editar la ventana después no cambia en
silencio un plazo ya comunicado por correo, y la regla sigue siendo una función pura sobre la fila.
CHECK en la BD: una solicitud `APROBADA` siempre tiene `diasVigencia`, y ambos valores quedan entre 1
y 90.

### Cerrada por fecha sí; archivada, despublicada o eliminada no

Una autorización vigente habilita subir y "Finalizar y enviar" con la ventana **cerrada por fecha**.
Una ventana **archivada, despublicada o eliminada** no admite ninguna subida, ni siquiera autorizada:
archivar o despublicar es una decisión explícita de sacar la ventana de circulación. Por coherencia,
pedir un reemplazo sobre una ventana así responde 409 `VENTANA_NO_DISPONIBLE`, porque esa aprobación
nunca podría usarse.

### Efecto sobre datos existentes

La migración dejó `diasVigencia = 5` en las solicitudes ya aprobadas y `diasReapertura = 5` en los
rechazos existentes. Con la fórmula nueva, las que pertenecen a una ventana todavía abierta pasan a
durar hasta su cierre: se alargan, nunca se acortan.

## Perfil Bioestadística (RF-37)

### Misma receta de área por perfil

`/bioestadistica` es un área top-level propia, como `/notificador` y `/revisor`: chequeo positivo en
`src/proxy.ts` (`esPerfilBioestadistica`), despacho desde `/inicio`, `exigirBioestadistica()` en cada
Route Handler bajo `/api/bioestadistica/**` y `exigirAdminORevisor()` en los endpoints
administrativos. El establecimiento pasa a ser obligatorio también para este perfil
(`perfilExigeEstablecimiento()` en `Perfil.ts`, usado por Zod, `validarEstablecimientoUsuario.ts` y
`UsuarioForm`), y se **copia** en cada carga para que la vista administrativa muestre dónde se
reportó aunque la persona cambie de establecimiento después.

### Habilitación por año, a partir de las ventanas del notificador

Bioestadística no tiene ventanas propias: un año está disponible si **alguna** `ventana_carga` de ese
año está publicada y abierta (`resolverAniosDisponibles()`), y la fecha de cierre mostrada es la más
tardía. "Alguna" en vez de un rango [mínima apertura, máximo cierre] porque la unión es exacta: dos
ventanas que no se traslapan no dejan abierto el hueco entre ellas. La carga guarda `anio` **sin FK**
a `ventana_carga`: una FK `Restrict` cambiaría la regla de RF-15 que decide entre eliminación física
y lógica de una ventana. Para el reemplazo se usa la fórmula de RF-36 con el máximo
`diasVigenciaReemplazo` y el máximo cierre de las ventanas publicadas y no archivadas del año (7 días
si no queda ninguna).

### Binario en disco, no en `Bytes`

A diferencia de `carga_archivo.contenidoArchivo`, el archivo de Bioestadística (hasta 200 MB) se
guarda en disco, bajo `DIRECTORIO_ARCHIVOS_BIOESTADISTICA`. Prisma lee y escribe `Bytes` como un
`Buffer` completo codificado en hexadecimal, lo que significaría picos de unos 400 MB por subida o
descarga sin posibilidad de streaming, además de inflar los respaldos de la BD.

- Temporal en `<base>/tmp/<uuid>.part`; definitivo en `<base>/<anio>/<cargaId>.<ext>`. La ruta la
  genera el servidor y `rutaAbsoluta()` verifica que quede dentro de `<base>`; el nombre original
  nunca forma parte de la ruta.
- La descarga es en streaming (`createReadStream` → `Readable.toWeb`) con `Content-Disposition`
  `filename*` (RFC 5987).
- Al arrancar se borran los `.part` anteriores al arranque, de subidas interrumpidas.

### Subida con el cuerpo crudo, nunca por el proxy

El cliente envía el archivo como cuerpo de la petición (`fetch(url, { body: file })`) con el nombre
en `X-Nombre-Archivo`, y el handler lee `request.body` en streaming: `request.formData()` cargaría
todo el multipart en memoria. Se rechaza antes por `Content-Length` y, además, se cuentan los bytes
reales durante la recepción. **`/api/**` nunca entra al `matcher` del proxy:** cuando el proxy
intercepta una petición, Next copia el cuerpo con un límite de 10 MB y lo trunca sin error
(`proxyClientMaxBodySize`). La invariante quedó escrita en `src/proxy.ts`.

### Validación inmediata de encabezados, procesamiento en segundo plano

1. En la misma petición se guarda el archivo, se calcula su SHA-256, se verifica la firma de bytes
   y se leen **solo los encabezados**. Un error ahí responde 400 al instante.
2. Se crea la cabecera en `PROCESANDO` y se responde 202.
3. En `after()` se recorren las filas en streaming y se insertan por lotes de 5.000, cada lote en su
   propia sentencia. No hay una transacción que abarque todo: la atomicidad lógica la da el estado,
   porque nada en `PROCESANDO` cuenta como dato vigente.
4. La activación es una transacción corta: consume la solicitud de reemplazo si sigue disponible,
   pasa la anterior a `REEMPLAZADA` y la nueva a `ACTIVA`. Índices únicos parciales para `ACTIVA` y
   `PROCESANDO` por (usuario, año, tipo); sus P2002 se traducen a `YA_REPORTADO` y `EN_PROCESO`.
5. Al fallar, la carga queda `FALLIDA` con un código (nunca contenido), y se borran sus filas (por
   lotes de 50.000) y su archivo. Si otro proceso la marcó `FALLIDA` mientras todavía se insertaban
   lotes, `eliminarFilasDeCargaFallida()` borra las filas que llegaron después; solo actúa sobre
   `FALLIDA`, nunca sobre una `REEMPLAZADA`, cuyas filas son historial.

Concurrencia: hasta 2 procesamientos simultáneos y otro limitador de 2 para la lectura de
encabezados, separados para que una respuesta HTTP no espere detrás de procesamientos que duran
minutos. Al arrancar, `instrumentation.ts` marca como `FALLIDA` todo `PROCESANDO` (asume una sola
instancia, igual que el scheduler de RF-17), y como respaldo un `PROCESANDO` de más de 2 h cuenta
como expirado.

### Lector de xlsx en streaming sobre métodos internos de exceljs

`leerHojaStreamingExcelJs.ts` abre el ZIP con `unzipper` y alimenta los parsers internos de
`exceljs` (`_parseSharedStrings`, `_parseStyles`, `_parseWorksheet`, etc.), porque el
`WorkbookReader` secuencial de exceljs perdía partes del archivo de forma no determinista. El costo es
depender de una API privada:

- `exceljs` y `unzipper` van con **versión exacta** en `package.json`.
- `tests/lector-xlsx-streaming.unit.ts` arma un xlsx de referencia y falla si esa API cambia.
- Las partes que exceljs mantiene enteras en memoria (relaciones, libro, estilos, textos compartidos)
  tienen un tope de 256 MB descomprimidos. Se revisa el tamaño declarado en el ZIP y, como ese dato
  se puede falsear, también los bytes reales que salen del descompresor. Es la defensa contra una
  bomba ZIP. La hoja de datos no tiene ese tope porque se lee fila a fila y la limita el tope de
  2.000.000 de filas.

### Retención sin depuración

Por decisión explícita, una carga `REEMPLAZADA` conserva su archivo en disco y sus filas JSONB como
historial descargable. Solo una `FALLIDA` se limpia. El crecimiento del almacenamiento está
registrado como deuda técnica en `docs/requerimientos.md`.

## Archivos del notificador en disco, validación asíncrona y descarga con fecha de notificación (RF-38)

### Las filas no se materializan: la columna se agrega al descargar

`carga_archivo_publicada_fila` se llenaba en el visto bueno y nadie la leía. El único dato extra que
se quería agregar, la fecha y hora de notificación, es el mismo para todas las filas de un archivo,
así que vive una sola vez en la cabecera (`finalizadaEn`, o `vistoBuenoEn` en cargas anteriores a
RF-14b; función pura `fechaHoraNotificacion()` en `CargaArchivo.ts`) y la columna se agrega **al
generar la descarga**, en streaming, desde el original. Si el archivo ya trae una columna con ese
nombre, la agregada se llama "… (sistema)". El archivo generado contiene los datos validados (primera
hoja, columnas declaradas, valores) y pierde formatos, otras hojas y fórmulas; por eso ADMIN y
REVISOR tienen también "Descargar original" (`/archivo/original`), byte a byte y sin limitador.

### Binario en disco con el mismo almacén que Bioestadística

Con 100 MB por archivo, `Bytes` repetiría el problema que RF-37 evitó (el `Buffer` completo
codificado en hexadecimal). `AlmacenArchivosDisco` pasó a `src/infrastructure/almacenamiento/` como
fábrica, y Bioestadística y el notificador son dos composiciones con directorio propio
(`DIRECTORIO_ARCHIVOS_BIOESTADISTICA`, `DIRECTORIO_ARCHIVOS_CARGAS`): una variable nueva y no un
directorio común, porque las rutas de `carga_bioestadistica` son relativas a su base y cambiarla las
rompería. Las cargas anteriores a RF-38 **conservan su binario en `contenidoArchivo` de forma
permanente** (no se migran, por decisión explícita): las descargas aceptan las dos fuentes, y un
CHECK (`carga_archivo_binario_presente`) exige que toda carga tenga una de las dos.

### Recepción en streaming; validación en segundo plano

La subida usa el patrón de RF-37: cuerpo crudo (no `formData()`), nombre en `X-Nombre-Archivo`, y
`/api/**` fuera del proxy. `RecibirArchivoCarga` revisa primero todo lo barato (asignación, ventana,
decisión pendiente, autorización de reemplazo, validación en curso) y **recién después lee el
cuerpo**, midiendo el tamaño real, el SHA-256 y la firma ZIP. Crea la carga en `PROCESANDO` y
responde 202; `ProcesarCargaArchivo` corre en `after()` dentro de un limitador. Un índice único
parcial (`usuarioId, ventanaCargaId WHERE estado = 'PROCESANDO'`) impide dos validaciones de la
misma combinación (P2002 → 409 `EN_PROCESO`). Validar 500.000 filas toma del orden de minutos, más
de lo que un `requestTimeout` o un proxy razonables mantienen abierta una petición; el notificador ve
"Validando archivo…" y la tarjeta consulta el estado cada 5 s. Los huérfanos se liberan al arrancar
y por expiración (2 h). Un fallo de la BD al leer el formato no se reporta como "archivo ilegible":
se propaga y la carga se libera por esas dos vías.

### Validación fila a fila con resultado idéntico al de memoria

El motor (`MotorValidacionFilas`) recibe las filas en orden y reutiliza sin cambios los validadores
de tipo, las reglas y los mensajes. Lo que antes necesitaba el libro completo se reemplazó por
estado acotado:
- `FILA_DUPLICADA`: un `Set` con el resumen SHA-256 de la clave por regla (~25 MB con 500.000 filas).
- `FILA_VACIA` y "sin filas de datos": un buffer de corridas de filas vacías que se resuelve al
  llegar la siguiente fila con datos o al terminar la hoja, de modo que el orden de los errores es
  el mismo de antes.
- Errores: se conservan los primeros 500 en orden y se cuenta el total (mismo `acotarErrores`).

El lector en streaming de exceljs no interpreta las celdas igual que `xlsx.load` (fórmulas, texto
enriquecido en `inlineStr`, `_xHHHH_`, hipervínculos, celdas combinadas). Por eso
`leerHojaStreamingExcelJs.ts` incluye una interpretación propia (`celdasComoLecturaEnMemoria`) que
usa utilidades internas de exceljs (`src/types/exceljs-internos.d.ts`, versión fija 4.4.0).
`tests/equivalencia-validacion.unit.ts` compara la referencia congelada de la validación en memoria
(`tests/referencia/`) con la nueva sobre un corpus sintético y archivos reales; debe dar cero
diferencias, salvo los cambios decididos:
- **más de 500.000 filas de datos** → `TOPE_FILAS_EXCEDIDO` (antes se ignoraban las sobrantes);
- **texto enriquecido** en un encabezado o una celda → `TEXTO_ENRIQUECIDO`;
- **filas numeradas fuera de orden** (`<row r>` repetido o descendente) → `ARCHIVO_NO_PROCESADO`. El
  conteo de filas usa el número que declara el propio archivo, igual que `rowCount` en memoria; sin
  esa exigencia, un archivo fabricado se saltaba el tope. Una fila sin `r` toma la anterior + 1.

Defensas frente a archivos maliciosos: tope de 256 MB descomprimidos por parte retenida en memoria,
3 GiB para la hoja de datos, tope de rangos combinados y tope de filas.

### Limitadores de concurrencia

`crearLimitadorConcurrencia` pasó a `src/infrastructure/concurrencia/`. Para el notificador: 2
validaciones y 2 descargas con columna a la vez (medido: el peor caso llega a 1,88 GB con 2 + 2). En
una descarga el turno se mantiene **mientras el cliente lee** y se libera al terminar, fallar o
cancelar; para que un cliente lento no bloquee a los demás, la espera máxima es de 30 s (503
`OCUPADO`) y cada usuario tiene una sola descarga generada a la vez (409 `DESCARGA_EN_CURSO`).

### `Content-Disposition` único

`src/app/api/_lib/descarga.ts` (`encabezadoContentDisposition`, `respuestaDescarga`) lo usan todas
las descargas: cargas, original, errores, plantilla y Bioestadística. `filename*` lleva el nombre
exacto con que se subió el archivo (RFC 5987, con `'()*` codificados y sin CR/LF).
