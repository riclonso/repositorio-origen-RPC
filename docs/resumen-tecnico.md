# Resumen técnico

Última actualización: 2026-09-16 (RF-17: alertas por email a notificadores, editor de texto enriquecido con Lexical, scheduler en proceso con node-cron)

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
| Logs                    | Winston, JSON, una instancia por archivo. `logs/errores.txt` (errores del sistema) y `logs/auditoria.txt` (operaciones sobre usuarios, formatos de archivo y cargas de reporte) implementados; `logs/upload.txt` (`infrastructure/logging/logUpload.ts`, rotación NATIVA de Winston) preparado en RF-13 y conectado en RF-14 desde `POST /api/notificador/cargas`; `logs/accesos.txt` (login exitoso y fallido, RF-07) pendiente. `logs/` está en `.gitignore`: contienen RUT e IP. Rotación de `errores.txt`/`auditoria.txt` a cargo del sistema operativo |
| Estado cliente          | Zustand (solo Client Components; sin stores creados aún) |
| Validación              | Zod |
| Estilos                 | Tailwind v4 (CSS-first, `@theme inline`), paleta oficial gob.cl (`gob-*`) |
| Iconos                  | `@phosphor-icons/react`, familia única del proyecto, centralizada en `shared/components/iconos.tsx` con tamaño y peso estandarizados |
| Cookies                 | cookies-next (`httpOnly`, `secure`, `sameSite`) |
| Calidad React           | react-doctor (`npx react-doctor@latest`, ver `.agents/skills/react-doctor/`) |
| Lectura de plantillas   | `exceljs` (RF-13), detrás del puerto `LectorPlantilla` en `modules/formatos-excel/application/ports.ts`; solo `.xlsx`/`.csv`, csv solo separador coma y UTF-8 |
| Lectura de archivos de reporte | `exceljs` (RF-14), detrás del puerto `LectorArchivoReporte` en `modules/reporte-excel/application/ports.ts`; mismas restricciones de formato que `LectorPlantilla`, tope de 20.000 filas de datos procesadas |
| Generación de Excel de salida | `exceljs` (RF-14, ampliación), primera vez que el proyecto ESCRIBE un `.xlsx` (antes solo lectura). Puerto `GeneradorExcelErrores` en `modules/reporte-excel/application/ports.ts`, implementación `infrastructure/generacion-excel/GeneradorErroresExcelJs.ts`, servido por `GET /api/notificador/cargas/[id]/errores`. Solo incluye fila/columna/tipo/mensaje del error, nunca contenido de celdas del archivo original |
| Gráficos                | Sin librería (RF-16): el único gráfico del proyecto (torta de 2 segmentos en el tablero de seguimiento) es un `div` con `conic-gradient` CSS inline, `shared/components/GraficoTortaProporcion.tsx`. Evaluar antes de instalar una librería de charts si aparece una necesidad más compleja |
| Editor de texto enriquecido | Lexical (`lexical`, `@lexical/react`, `@lexical/list`, `@lexical/link`, `@lexical/html`, v0.50.0) desde RF-17, para la plantilla de alerta editable. Se instaló sin conflicto de peers contra React 19.2.8 (Lexical 0.50 declara `react: ">=18.x"`); si una actualización futura de Lexical dejara de soportar la versión de React del proyecto, revisar `EditorTextoEnriquecidoLimitado.tsx` antes de forzar la instalación |
| Sanitización de HTML    | `sanitize-html` (RF-17), único punto del proyecto que produce/recibe HTML enriquecido con datos parcialmente controlados por un usuario. `modules/ventanas-carga/domain/entities/PlantillaAlerta.ts`. Nota de librería: con `transformTags` degradando un `<a>` no autorizado a un tagName que NO está en `allowedTags`, dos transformaciones en el mismo documento dejan el HTML con etiquetas de cierre desalineadas entre hermanos — por eso `span` está en `allowedTags` aunque el editor nunca lo produzca directamente (ver comentario en el archivo) |
| Tareas programadas      | `node-cron` (RF-17), scheduler en el mismo proceso de Next.js (sin infraestructura de colas/cron externa). `src/infrastructure/scheduler/schedulerAlertasVentanas.ts`, arrancado una vez por proceso desde `src/instrumentation.ts` (`register()`, filtrado por `NEXT_RUNTIME === "nodejs"`) |

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

No hay test runner configurado todavía en este repo (sin Jest/Vitest). Sí existen scripts de
integración ad-hoc en `tests/*.integration.ts`, ejecutados con `tsx` contra PostgreSQL local
desechable — ver comando exacto en "Recuperación de contraseña (RF-10)" más abajo.

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
| Visor de registros    | Implementado | `/dashboard/logs` (solo ADMIN) lee `logs/errores.txt` y `logs/auditoria.txt` vía `infrastructure/logging/leerLogs.ts`, que lee solo la cola del archivo para acotar memoria. |
| `modules/perfiles/`    | Implementado | Catálogo de perfiles (RF-09). Solo lectura por ahora: los perfiles se agregan por SQL hasta que exista el mantenedor. |
| `modules/usuarios/`    | Implementado | Mantenedor de usuarios (RF-06): listar con búsqueda y paginación en servidor, crear, editar, activar/desactivar, restablecer contraseña, reenviar enlace de activación. Desde RF-13 también asigna formatos de archivo (N:M) a usuarios NOTIFICADOR_RPC. 6 endpoints bajo `app/api/usuarios/` con guard `exigirAdminORevisor()`. Acceso completo y simétrico para ADMIN (`/dashboard/usuarios`) y REVISOR_REPOSITORIO (`/revisor/usuarios`, agregado posterior a RF-15), salvo que un actor sin perfil ADMIN no puede crear, editar, activar/desactivar, restablecer la contraseña ni reenviar el enlace de una cuenta ADMIN, ni asignar el perfil ADMIN a nadie (motivo `PERFIL_ADMIN_RESTRINGIDO`, aplicado en `application/`). Componentes de UI en `shared/components/` con prop `rutaBase` y booleano `actorEsAdmin`. Ver [docs/arquitectura.md](arquitectura.md#acceso-extendido-a-revisor_repositorio-con-restricción-perfil_admin_restringido-posterior-tras-rf-15). |
| `modules/formatos-excel/` | Implementado | Mantenedor de formatos de archivo (RF-13): define columnas, cuáles son requeridas y su tipo de dato (8 valores desde RF-14: incluye RUT y EMAIL) a partir de una plantilla `.xlsx`/`.csv` subida por quien lo crea; conserva la plantilla para descarga. Extensión: reglas de validación por conjunto de columnas (`ALGUNA_COLUMNA_CON_VALOR`, hasta 100 por formato), gestionadas en la misma pantalla; el evaluador que las ejecuta contra un archivo real se construyó en RF-14. 6 endpoints bajo `app/api/formatos-excel/` con guard `exigirAdminORevisor()`. Acceso completo y simétrico para ADMIN (`/dashboard/formatos-excel`) y REVISOR_REPOSITORIO (`/revisor/formatos-excel`, agregado posterior a RF-15), sin restricción de autoría; los 5 componentes de UI viven en `shared/components/` y reciben `rutaBase` como prop. Ver [docs/arquitectura.md](arquitectura.md#acceso-extendido-a-revisor_repositorio-posterior-a-rf-15). |
| Panel notificador     | Implementado | Panel del perfil NOTIFICADOR_RPC (RF-12) en `/notificador`, área separada de `/dashboard` (solo ADMIN). Login → despachador `/inicio` que redirige por perfil; proxy protege ambas áreas con chequeo positivo. Desde RF-14 incluye la sección de subida y validación de reportes. Desde RF-15 (y su ampliación posterior), ya no hay `<select>` manuales de formato ni de año: el home muestra una sección de subida automática por cada combinación (formato asignado al notificador, ventana publicada y abierta) cuyo tipo de archivo coincide. Ver [docs/arquitectura.md](arquitectura.md#panel-del-perfil-notificador_rpc-rf-12). |
| `modules/reporte-excel/` | Implementado | Subida y validación de archivos de reporte por NOTIFICADOR_RPC (RF-14): valida estructura, tipo de dato por celda y reglas de RF-13 contra el archivo subido; resumen de errores por fila; visto bueno irreversible que hace la carga visible para ADMIN (`/dashboard/cargas`) y el nuevo perfil REVISOR_REPOSITORIO (`/revisor`, área top-level nueva). 8 endpoints (5 bajo `/api/notificador/`, 3 bajo `/api/dashboard/cargas/` + equivalentes de solo lectura en `/revisor`). Desde RF-15, cada carga queda asociada a una `VentanaCarga` (`ventanaCargaId`) y la subida exige que exista una ventana abierta para el año elegido. Ver [docs/arquitectura.md](arquitectura.md#subida-y-validación-de-archivos-de-reporte-rf-14). |
| `modules/ventanas-carga/` | Implementado | Ventanas de tiempo por año que habilitan la subida de reportes (RF-15): ADMIN y REVISOR_REPOSITORIO crean, editan y eliminan ventanas (`fechaApertura`/`fechaVencimiento`; `(anio, formatoExcelId)` único como par solo mientras la ventana no esté eliminada, vía índice único parcial); "abierta" se calcula en cada lectura, sin cron. Eliminar es física sin cargas asociadas o lógica con alguna (decidido por el `ON DELETE RESTRICT`, no por conteo previo), y solo ADMIN puede eliminar cualquiera (REVISOR_REPOSITORIO solo las propias). Ampliación posterior: cada ventana nace como borrador (`publicada = false`) hasta que un ADMIN/REVISOR la publica con un switch dedicado (`PATCH .../publicacion`, sin restricción de ownership); una ventana no publicada o de otro formato queda excluida en el propio `WHERE` de Prisma de lo que ve el notificador, no solo oculta en la UI. **Corrección posterior:** el enum `tipoArchivo` (`EXCEL`/`CSV`) que originalmente declaraba cada ventana se reemplazó por `formatoExcelId`, una referencia directa (relación 1:1) a un `FormatoExcel` concreto — porque el tipo genérico no expresaba las reglas ni el número de columnas requeridas/opcionales reales del formato. `FormatoExcel.tipoArchivo` se mantiene intacto en `modules/formatos-excel/` como dato informativo, solo perdió a `VentanaCarga` como consumidor de matching. 7 endpoints bajo `app/api/dashboard/ventanas-carga/` (agregado `PATCH .../archivado`), pantallas `/dashboard/ventanas-carga` y `/revisor/ventanas-carga` (primera escritura de REVISOR_REPOSITORIO). Nuevo tipo de regla `FECHA_DENTRO_DE_VENTANA_VIGENTE` en `modules/formatos-excel/`. Ampliación posterior: la tabla de ventanas muestra la cantidad de cargas APROBADAS por ventana (`_count` de Prisma, sin N+1) y una acción "Detalle" navega a `/dashboard/ventanas-carga/[id]` / `/revisor/ventanas-carga/[id]` (páginas nuevas, mismo guard de `src/proxy.ts`, sin Route Handler nuevo) con el listado paginado de esas cargas y descarga vía el endpoint ya existente de `reporte-excel`; usa `<ViewTransition>` de `react` (soportado por Next 16 sin instalar `react@canary`). **Ampliación posterior — archivar/desarchivar, buscador y filtro por formato:** `VentanaCarga.archivada` (cuarto eje de estado, independiente de `publicada`/`eliminadaEn`) oculta la ventana de la tabla por defecto; archivar despublica en la misma escritura atómica (`cambiarArchivadoVentanaCarga`/`PATCH .../archivado`), desarchivar no vuelve a publicar sola. `CambiarPublicacionVentanaCarga` rechaza ahora activar la publicación (`publicada: true`) de una ventana archivada con el motivo `VENTANA_ARCHIVADA` (409). La tabla (`TablaVentanasCarga`) ganó un buscador por año/formato y un filtro por formato de archivo (resueltos en cliente, sin endpoint nuevo) y un interruptor "Mostrar archivadas" (apagado por defecto). Ver [docs/arquitectura.md](arquitectura.md#formato-de-archivo-por-ventana-y-publicación-explícita-ampliación-de-rf-15), [#cantidad-de-cargas-por-ventana-y-detalle-de-cargas-aprobadas-ampliación-de-rf-15](arquitectura.md#cantidad-de-cargas-por-ventana-y-detalle-de-cargas-aprobadas-ampliación-de-rf-15) y [#archivar-desarchivar-ventanas-buscador-y-filtro-por-formato-ampliación-de-rf-15](arquitectura.md#archivar-desarchivar-ventanas-buscador-y-filtro-por-formato-ampliación-de-rf-15). **RF-17 (alertas por email):** `diasAnticipacionInicio`/`intervaloRepeticionDias`/`plantillaAlerta` nuevos en `VentanaCarga`; tabla nueva `AlertaNotificacionVentana` agrupada por `loteId`, con índice único parcial de deduplicación del envío automático diario. 4 endpoints nuevos bajo `.../[id]/alertas/`, scheduler `node-cron` vía `src/instrumentation.ts`, editor Lexical acotado a 4 botones. Ver [docs/arquitectura.md](arquitectura.md#alertas-por-email-a-notificadores-rf-17). |

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
* **RF-13 (`20260911174909_formatos_excel`) es aditiva.** Crea el enum `TipoDatoColumna` y las tablas
  `formato_excel`, `columna_formato_excel` y `usuario_formato_excel`; no toca ninguna tabla existente
  ni requiere `pg_dump` previo ni backfill. Admite despliegue rolling.
* **Extensión de RF-13 (`20260911200529_regla_validacion_formato_excel`) también es aditiva.** Crea
  el enum `TipoReglaValidacionFormatoExcel` y la tabla `regla_validacion_formato_excel`
  (`ON DELETE CASCADE` desde `formato_excel`); no toca ninguna tabla existente. Admite despliegue
  rolling.
* **RF-14 (`20260914124810_reporte_excel_rf14`) es aditiva, con un INSERT de datos incluido.**
  Agrega `RUT`/`EMAIL` a `TipoDatoColumna` (`ALTER TYPE ... ADD VALUE`, no reversible en la misma
  transacción si hiciera falta deshacerla, mismo caveat que cualquier `ADD VALUE` de Postgres),
  inserta la fila `REVISOR_REPOSITORIO` en `perfil` (mismo mecanismo de datos que RF-09, editado a
  mano antes del DDL generado por Prisma) y crea `carga_archivo`/`error_carga_archivo`
  (`ON DELETE RESTRICT` desde `usuario`/`formato_excel`, `ON DELETE CASCADE` desde
  `carga_archivo` hacia sus errores). No borra ni modifica ninguna tabla existente. Admite
  despliegue rolling. **Después de aplicar esta migración, si el proceso de la aplicación ya estaba
  corriendo, hace falta reiniciarlo** (no solo `prisma migrate deploy`): el cliente de Prisma en
  memoria de un proceso ya arrancado no ve los valores nuevos del enum `TipoDatoColumna` hasta que
  se reinicia con el cliente regenerado (`prisma generate` + restart), o falla con
  `Invalid value for argument tipoDato` al intentar usarlos.
* **RF-15 (`20260914180209_ventanas_carga_rf15`) es aditiva, con backfill de datos existentes.**
  Agrega `FECHA_DENTRO_DE_VENTANA_VIGENTE` a `TipoReglaValidacionFormatoExcel`, crea
  `ventana_carga` y agrega `carga_archivo.ventanaCargaId` (`NOT NULL`, `ON DELETE RESTRICT`). Como
  ya existían filas en `carga_archivo` en la base de desarrollo al momento de crear esta migración,
  el `desarrollador` reordenó el diff generado por Prisma a mano: crea `ventana_carga` primero,
  agrega `ventanaCargaId` como columna *nullable*, hace un backfill (una `VentanaCarga` sintética
  por cada año ya presente en `carga_archivo`) y recién entonces aplica `SET NOT NULL` + la FK. Ese
  backfill es válido para una base de desarrollo/desechable, pero **no es una estrategia de
  migración apta para un dataset de producción con cargas reales ya existentes** — si esta
  migración llega a aplicarse contra datos reales, revisar antes la estrategia de backfill con el
  equipo (qué fechas de apertura/vencimiento asignarle a la ventana sintética, quién figura como
  `creadoPorId`). Mismo caveat de `ALTER TYPE ... ADD VALUE` que RF-14: no reversible en la misma
  transacción si hiciera falta deshacerla. No requiere reinicio del proceso más allá del ya
  documentado para cualquier `ADD VALUE` de enum (RF-14, arriba).
* **Extensión de RF-15 (`20260914191128_eliminar_ventana_carga_rf15`) es aditiva.** Agrega
  `ventana_carga.eliminadaEn`/`eliminadaPorId` (ambas nullable) y su FK a `usuario`; no toca
  ninguna columna ni tabla existente y no requiere backfill (las ventanas ya creadas simplemente
  quedan con `eliminadaEn = NULL`, es decir, no eliminadas). **Contiene una sentencia SQL agregada
  a mano** fuera del diff generado por Prisma: `DROP INDEX "ventana_carga_anio_key"` (generado) se
  complementa con un `CREATE UNIQUE INDEX ... WHERE "eliminadaEn" IS NULL` escrito a mano, porque
  la unicidad de `anio` debe regir solo entre las ventanas no eliminadas y Prisma no expresa un
  índice único parcial en su schema DSL — mismo mecanismo ya usado en RF-09/RF-14 para insertar
  datos fuera del DDL generado. Admite despliegue rolling.
* **Ampliación de RF-15 (`20260914200915_add_tipo_archivo_y_publicacion`) es aditiva, con backfill
  manual de datos.** Crea el enum `TipoArchivo` y agrega `formato_excel.tipoArchivo` y
  `ventana_carga.tipoArchivo`/`ventana_carga.publicada`; no borra ni modifica ninguna columna
  existente. **Contiene backfill agregado a mano** fuera del diff generado por Prisma (mismo
  mecanismo que RF-09/RF-14/RF-15): las columnas `tipoArchivo` nacen `NULL`, se backfillean y recién
  entonces se fijan `NOT NULL`. El de `formato_excel.tipoArchivo` es determinista (derivado 1:1 de
  `tipoContenidoPlantilla`, ya persistido); el de `ventana_carga.tipoArchivo` es **arbitrario por
  decisión explícita del usuario** (`EXCEL` para todas las ventanas ya creadas en RF-15) — si esta
  migración llega a aplicarse contra datos reales con ventanas de tipo CSV ya en uso, revisar el
  backfill con el equipo antes de aplicarla. `ventana_carga.publicada` no tiene ese problema (nace
  `false` con `DEFAULT`, sin ambigüedad). Admite despliegue rolling. **Requiere reiniciar el proceso
  después de aplicarla** (mismo caveat de cliente de Prisma en memoria que RF-14/RF-15): `npx prisma
  generate` + restart, o falla con `Unknown argument 'tipoArchivo'`/`'publicada'`.
* **Corrección de RF-15 (`20260915140000_ventana_carga_formato_excel`) es aditiva, con backfill
  dirigido de datos existentes.** Reemplaza `ventana_carga.tipoArchivo` (enum) por
  `ventana_carga.formatoExcelId` (FK a `formato_excel`, `ON DELETE RESTRICT`, `ON UPDATE CASCADE`).
  **Contiene backfill agregado a mano** fuera del diff generado por Prisma, mismo mecanismo que las
  migraciones anteriores de este módulo: la columna nace `NULL`, se hizo una consulta previa contra
  la base de desarrollo (`node --env-file=.env --import tsx`) que confirmó una sola fila en
  `ventana_carga` con `eliminadaEn IS NULL` (año 2026, `tipoArchivo = EXCEL`) antes de escribir el
  `UPDATE` dirigido a un id concreto de formato ("VARIABLES ENVIO DE HEMATOLOGIA", el único con
  cargas reales asociadas a esa ventana), y recién entonces se fija `NOT NULL`. Este backfill **no
  es una estrategia genérica para un dataset con más de una ventana sin eliminar**: si esta
  migración llega a aplicarse contra una base con varias ventanas reales, hay que resolver el
  backfill caso a caso antes de aplicarla, no reutilizar el mismo id a ciegas. También reemplaza el
  índice único parcial de `anio` (de la migración `eliminar_ventana_carga_rf15`) por uno sobre
  `(anio, "formatoExcelId")`, mismo `WHERE "eliminadaEn" IS NULL`. Admite despliegue rolling.
  **Requiere reiniciar el proceso después de aplicarla** (mismo caveat de cliente de Prisma en
  memoria que las migraciones anteriores): `npx prisma generate` + restart, o falla con
  `Unknown argument 'formatoExcelId'`/`Unknown argument 'tipoArchivo'` según el sentido del desfase.
* **Ampliación de RF-13/14/15 (`20260915153431_agregar_regla_fecha_efectiva_anio_ventana`) es
  aditiva, sin backfill.** Agrega `FECHA_EFECTIVA_DENTRO_DEL_ANIO_VENTANA` a
  `TipoReglaValidacionFormatoExcel` (`ALTER TYPE ... ADD VALUE`, mismo caveat de siempre: no
  reversible en la misma transacción si hiciera falta deshacerla). No toca ninguna tabla ni columna
  existente; ninguna fila puede usar el valor nuevo todavía, así que no hace falta backfill. Admite
  despliegue rolling. **Requiere reiniciar el proceso después de aplicarla** (mismo caveat de
  cliente de Prisma en memoria que RF-14/15): `npx prisma generate` + restart, o falla con
  `Invalid value for argument tipo` al intentar guardar una regla de este tipo nuevo.
* **Ampliación de RF-15 (`20260916124153_agregar_archivada_ventana_carga`) es aditiva, sin
  backfill.** Agrega `ventana_carga.archivada` (`Boolean @default(false)`), un cuarto eje de
  estado independiente de `publicada`/`eliminadaEn`: oculta la ventana de la vista por defecto del
  panel (recuperable con "Mostrar archivadas"), forzando `publicada = false` en la misma escritura
  al archivar (`cambiarArchivadoVentanaCarga`); desarchivar no la vuelve a publicar sola. El
  `DEFAULT false` cubre las filas existentes sin ambigüedad. Admite despliegue rolling. **Requiere
  reiniciar el proceso después de aplicarla** (mismo caveat de cliente de Prisma en memoria que el
  resto de migraciones de este módulo): `npx prisma generate` + restart, o falla con
  `Unknown argument 'archivada'`.


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
