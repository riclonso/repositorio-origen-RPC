# Requerimientos

Última actualización: 2026-09-16

> Este documento se actualiza automáticamente al final del flujo `/feature` (ver
> `.claude/commands/feature.md`) cada vez que se aprueba e implementa un requerimiento nuevo. También
> puede actualizarse a mano cuando cambian los requisitos de negocio sin pasar por ese flujo.

## Objetivo del sistema

Sistema que usan laboratorios y/o unidades de entidades de salud, para reportar datos en formato
Excel o CSV.

**Pendiente de definir** (ver Preguntas abiertas): qué datos exactos se reportan, de qué proceso o
entidad provienen, quién los sube, con qué periodicidad y bajo qué validaciones. `CLAUDE.md`
conserva un placeholder (`[xxxxxxx]`) para esto — no se debe asumir el detalle, debe especificarlo
el usuario/product owner antes de diseñar ese módulo.

## Requerimientos funcionales

### Implementados

| ID    | Requerimiento                                                              | Notas |
|-------|------------------------------------------------------------------------------|-------|
| RF-01 | Autenticación por RUT + contraseña                                          | `POST /api/auth/login`, JWT (jose, HS256, 8h) en cookie httpOnly `sesion` |
| RF-02 | Protección de rutas `/dashboard/:path*` para rol `ADMIN`                    | `src/proxy.ts` |
| RF-03 | Cierre de sesión                                                             | Server Action `cerrarSesionAction` en `app/dashboard/actions.ts` |
| RF-04 | Modelo de usuario con `email`, `rut`, `username` únicos                     | `prisma/schema.prisma`, modelo `Usuario`. El `username` siempre es el RUT de la persona (no se ingresa, se deriva con `derivarUsername()`). |
| RF-05 | Seed de usuario administrador inicial                                       | `scripts/seed-admin.ts`, `npm run db:seed` |
| RF-06 | Mantenedor de usuarios: listar (búsqueda y paginación en servidor), crear, editar, activar/desactivar y enviar enlaces de contraseña | Pantalla `/dashboard/usuarios`, módulo `modules/usuarios/` y endpoints protegidos bajo `app/api/usuarios/`. Fuera de alcance por decisión: borrado físico (la baja lógica preserva trazabilidad) y edición de `rut`/`username` (el RUT es la credencial de acceso). |
| RF-08 | Auditoría de operaciones sobre usuarios                                      | `logs/auditoria.txt` vía `registrarAuditoria()`. Audita las cuatro escrituras en éxito y también los rechazos (403, 409, 404). No audita lecturas ni errores de validación. Nunca registra contraseñas ni hashes. |
| RF-09 | Catálogo de perfiles en base de datos, reemplazando el enum `Rol`         | Tabla `perfil` con `ADMIN` ("Administrador") y `NOTIFICADOR_RPC` ("Notificador RPC"). `usuario.rol` pasa a `usuario.perfilCodigo` (FK). Módulo `modules/perfiles/`. Agregar un perfil es un INSERT, sin desplegar. **Los permisos siguen en código**: una fila nueva crea un perfil asignable, no uno con permisos. |
| RF-11 | Visor de registros del sistema (errores y auditoría)                        | Pantalla solo-ADMIN en `/dashboard/logs` con dos pestañas que leen `logs/errores.txt` y `logs/auditoria.txt`. Lector `infrastructure/logging/leerLogs.ts` que hace streaming línea por línea (memoria acotada a 500 entradas), con filtro opcional por rango de fechas (día desde / día hasta, en zona America/Santiago), paginación de 25/50/100 por página (25 por defecto), más recientes primero, detalle colapsable. Solo lectura; no expone rutas absolutas. Construido fuera del flujo `/feature` por ser una pantalla de solo lectura. |
| RF-12 | Panel propio del perfil NOTIFICADOR_RPC                                      | Área top-level separada `/notificador` (no `/dashboard`, que sigue siendo solo-ADMIN de punta a punta). Tras el login, el cliente navega (duro) a un despachador server-side `/inicio` que lee la sesión y redirige según perfil: ADMIN → `/dashboard`, NOTIFICADOR_RPC → `/notificador`. El proxy protege ambas áreas con `matcher: ["/dashboard/:path*","/notificador/:path*"]` y chequeo **positivo** por perfil (`esPerfilAdministrador` / `esPerfilNotificador`); un perfil que no corresponde al área se reenvía a `/inicio`, no a `/login`. Por ahora el panel es solo shell + bienvenida con el nombre del usuario (se agregó `buscarPorId` al repositorio de `auth`) y una sección "Próximamente" para el reporte Excel/CSV. Shell compartido por ambos paneles (`EncabezadoPanel`, `NavegacionPanel`, `cerrarSesionAction` en `shared/`). Ambos paneles muestran en el encabezado el nombre de la persona logueada y el nombre visible de su perfil (`app/_lib/identidadPanel.ts` + `buscarPorCodigo` en el repositorio de `perfiles`), y la bienvenida con el nombre en la página de inicio (admin y notificador). Sin cambios de BD. |
| RF-13 | Alta de usuarios sin contraseña y activación por correo                      | El administrador crea la cuenta sin contraseña; `contrasenaHash = NULL` representa el estado pendiente. Se envía un enlace de un uso y 8 horas para crear la contraseña. El alta se conserva si falla SMTP y el mantenedor permite reenviar el enlace. Para cuentas ya activadas, la misma acción envía un enlace de restablecimiento. |
| RF-16 | Dos vías para definir la contraseña de un usuario desde el mantenedor | En `/dashboard/usuarios/[id]/contrasena` el administrador elige entre **(1) enviar un enlace** por correo para que la persona la cree/cambie (`POST /api/usuarios/[id]/enlace-contrasena`, camino de RF-13) o **(2) fijarla manualmente** él mismo (`PUT /api/usuarios/[id]/contrasena`, caso de uso `restablecerContrasena` con validación de complejidad y confirmación). Ambas invalidan los enlaces vigentes de la cuenta y activan una cuenta pendiente. El fijado manual audita `CONTRASENA_RESTABLECIDA`. Implementado fuera del flujo `/feature` por decisión del usuario. |
| RF-14 | Mantenedores de tipos de establecimiento y de establecimientos (ADMIN-only) | Dos mantenedores nuevos bajo `/dashboard`, mismo patrón que usuarios. **Tipos de establecimiento** (`/dashboard/tipos-establecimiento`, módulo `modules/tipoEstablecimiento/`): catálogo chico (listado simple sin búsqueda) con campo `nombre`; unicidad por `nombreNormalizado` derivado (`shared/utils/texto.ts`, sin tildes/mayúsculas). **Establecimientos** (`/dashboard/establecimientos`, módulo `modules/establecimiento/`): campos `rut` (único, validado con dígito verificador, editable tras crear), `nombre` (no único), `direccion` (obligatoria) y `tipo` por FK; búsqueda + paginación en servidor con `unaccent`. Ambos con crear, editar y activar/desactivar por baja lógica (`activo`), sin borrado físico. El selector de tipo ofrece solo tipos activos; en edición incluye el tipo vigente aunque esté inactivo. Desactivar un tipo lo saca del selector sin tocar los establecimientos que ya lo usan. Endpoints bajo `app/api/tipos-establecimiento/` y `app/api/establecimientos/` con `exigirAdmin()` en cada handler (helpers genéricos en `app/api/_lib/http.ts`). Sin auditoría por ahora; errores técnicos a `logs/errores.txt`. |

### En progreso / stub (sin implementar)

| ID    | Requerimiento                          | Estado |
|-------|-----------------------------------------|--------|
| RF-07 | Log de accesos: registrar todo intento de login, exitoso y fallido | Definido en `CLAUDE.md` (sección Logging) con los campos y el destino `logs/accesos.txt`. **Sin implementar**: el `logger` actual solo tiene nivel `error` con un transporte a `logs/errores.txt`; falta agregar el logger/transporte de accesos y conectarlo en `app/api/auth/login/route.ts`. |

### Pendientes de definir

* Módulo de reporte de datos en Excel/CSV (objetivo central del sistema, ver arriba) — sin
  especificar aún.

## Cómo se agrega un requerimiento nuevo

1. Correr `/feature <descripción del requerimiento>` (ver
   [.claude/commands/feature.md](../.claude/commands/feature.md)).
2. El agente `architecto` diseña, el usuario aprueba, el agente `desarrollador` implementa y el
   agente `revisor` audita.
3. Al final del flujo, este archivo se actualiza con el nuevo requerimiento (ID correlativo, estado,
   notas), y `docs/arquitectura.md` / `docs/resumen-tecnico.md` si el cambio los afecta.

### RF-10: recuperación por correo
Implementado: solicitud pública por email, enlace de 2 horas y un uso, máximo 3 solicitudes cada 15 minutos
por cuenta, validación compartida de contraseña y envío SMTP institucional configurable.
Pendiente operativo: configurar el relay y comprobar entrega real.
