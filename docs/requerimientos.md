# Requerimientos

Última actualización: 2026-09-04

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
| RF-04 | Modelo de usuario con `email`, `rut`, `username` únicos                     | `prisma/schema.prisma`, modelo `Usuario` |
| RF-05 | Seed de usuario administrador inicial                                       | `scripts/seed-admin.ts`, `npm run db:seed` |

### En progreso / stub (sin implementar)

| ID    | Requerimiento                          | Estado |
|-------|-----------------------------------------|--------|
| RF-06 | CRUD de administración de usuarios      | `modules/usuarios/` es andamiaje: `CrearUsuario`, `ObtenerUsuario` y `PrismaUsuarioRepository` lanzan `Error("...: no implementado")` a propósito. `app/dashboard/usuarios/page.tsx` y `app/api/usuarios/route.ts` son placeholders. |

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
