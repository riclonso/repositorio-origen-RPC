# Script de Limpieza de Base de Datos

Scripts SQL y TypeScript para limpiar y eliminar usuarios e historial de cargas en la base de datos de **repositorio-rem**.

⚠️ **ADVERTENCIA**: Todas las operaciones son **IRREVERSIBLES**. Siempre requieren confirmación explícita.

**Opción recomendada:** Usar los scripts SQL si eres administrador de BD, o los scripts TypeScript si no tienes acceso directo a psql.

## Scripts disponibles

### 🔧 SCRIPTS SQL (acceso directo a BD)

#### 1. `limpiar-usuarios.sql` (simple)

Script SQL básico que elimina usuarios por ID. Requiere editar la tabla temporal con los IDs.

**Uso:**
```bash
# Editar el archivo y reemplazar los IDs en:
# INSERT INTO ids_a_eliminar VALUES (...)

psql -h localhost -U usuario -d repositorio-rem -f scripts/limpiar-usuarios.sql
```

**Ventajas:**
- Simple y directo
- Sin dependencias (solo SQL)
- Fácil de auditar antes de ejecutar

**Pasos:**
1. Editar `scripts/limpiar-usuarios.sql`
2. Reemplazar UUIDs en `INSERT INTO ids_a_eliminar`
3. Revisar el SELECT que muestra usuarios encontrados
4. Descomentar `COMMIT;` al final
5. Ejecutar con `psql`

#### 2. `limpiar-bd.sql` (avanzado, con funciones)

Script SQL con funciones PL/pgSQL reutilizables para limpiar desde psql o aplicaciones.

**Uso:**
```bash
# 1. Crear las funciones (una sola vez):
psql -h localhost -U usuario -d repositorio-rem -f scripts/limpiar-bd.sql

# 2. Usar las funciones:

# Ver reporte de todos:
psql -h localhost -U usuario -d repositorio-rem -c "SELECT * FROM reportar_usuarios();"

# Ver datos de un usuario antes de eliminar:
psql -h localhost -U usuario -d repositorio-rem -c "SELECT * FROM reportar_usuario('550e8400-e29b-41d4-a716-446655440000');"

# Ver cuántos registros se van a eliminar:
psql -h localhost -U usuario -d repositorio-rem -c "SELECT * FROM contar_a_eliminar('550e8400-e29b-41d4-a716-446655440000');"

# ELIMINAR un usuario:
psql -h localhost -U usuario -d repositorio-rem -c "SELECT * FROM limpiar_usuario('550e8400-e29b-41d4-a716-446655440000');"

# ELIMINAR por RUT:
psql -h localhost -U usuario -d repositorio-rem -c "SELECT * FROM limpiar_por_rut('12345678-9');"
```

**Funciones disponibles:**

| Función | Uso | Retorna |
|---------|-----|---------|
| `reportar_usuario(id)` | Ver datos de un usuario | RUT, nombres, cargas, etc. |
| `reportar_usuarios()` | Ver todos los usuarios | Tabla de usuarios con conteos |
| `contar_a_eliminar(id)` | Ver qué se va a borrar | Tabla por entidad |
| `limpiar_usuario(id)` | **ELIMINAR** un usuario | Éxito, cantidad eliminada, mensaje |
| `limpiar_por_rut(rut)` | **ELIMINAR** por RUT | Éxito, cantidad eliminada, mensaje |

**Ventajas:**
- Reutilizable desde scripts o aplicaciones
- Reportes detallados
- Manejo de errores integrado
- Transacciones atómicas

---

### 💻 SCRIPTS TYPESCRIPT (sin acceso directo a BD)

#### 1. `limpiar-usuarios.ts` (simple, interactivo)

Script interactivo que pide los IDs de usuarios a eliminar y genera un reporte antes de ejecutar.

**Uso:**
```bash
npx tsx scripts/limpiar-usuarios.ts
```

**Flujo:**
1. Pide IDs de usuarios (separados por comas)
2. Busca y muestra los usuarios encontrados
3. Cuenta cargas por usuario
4. Pide confirmación explícita (`SÍ`)
5. Elimina en transacción atómica:
   - ✓ Cargas del notificador (CASCADE elimina relacionados)
   - ✓ Cargas de Bioestadística
   - ✓ Alertas
   - ✓ Mensajes
   - ✓ Usuario

### 2. `limpiar-bd.ts` (avanzado, parámetros)

Script por línea de comandos con opciones variadas.

**Opciones:**
```bash
--usuarios <id1,id2,...>     Eliminar por IDs
--rut <rut>                  Eliminar por RUT
--establecimiento <id>       Todos los usuarios de un establecimiento
--estado <ESTADO>            Cargas en cierto estado (PROCESANDO, RECIBIDA, etc.)
--temporal <dias>            Cargas sin finalizar hace N días
--limpiar-todo               Cargas huérfanas (sin usuario)
--reportar                   Generar reporte sin eliminar nada
--help, -h                   Mostrar esta ayuda
```

**Ejemplos:**

```bash
# Eliminar dos usuarios (requiere confirmación)
npx tsx scripts/limpiar-bd.ts --usuarios 550e8400-e29b-41d4-a716-446655440000,6ba7b810-9dad-11d1-80b4-00c04fd430c8

# Eliminar por RUT
npx tsx scripts/limpiar-bd.ts --rut 12345678-9

# Ver reporte sin eliminar
npx tsx scripts/limpiar-bd.ts --usuarios 550e8400-e29b-41d4-a716-446655440000 --reportar

# Todos los usuarios de un establecimiento (reporte)
npx tsx scripts/limpiar-bd.ts --establecimiento est-123 --reportar
```

## Qué se elimina

Al eliminar un usuario, se eliminan **en cascada**:

| Entidad | Relación | Eliminada |
|---------|----------|-----------|
| **CargaArchivo** | Cargas subidas por el usuario | ✓ |
| **CargaBioestadistica** | Cargas de Bioestadística subidas | ✓ |
| **AlertaNotificacionVentana** | Alertas recibidas o disparadas | ✓ |
| **MensajeCarga** | Mensajes escritos o recibidos | ✓ |
| **SolicitudReemplazoCarga** | Solicitudes de reemplazo | ✓ (Restrict) |
| **VentanaCarga** | Ventanas creadas o eliminadas | ✓ (Restrict) |
| **PublicacionCargaArchivoFila** | Publicaciones | ✓ (Restrict) |

Las dependencias con `Restrict` **impiden eliminar** si el usuario tiene historial. El script reporta cuáles bloquean.

## Confirmación

Antes de eliminar, el script pide que escribas exactamente:
```
ELIMINAR
```

Esto evita accidentes. Solo se ejecuta si escribes el texto exacto.

## Seguridad

- Los IDs se parametrizan (sin concatenación de strings)
- Las transacciones son atómicas (todo o nada)
- Se usan consultas preparadas de Prisma
- Se genera reporte antes de eliminar
- Requiere confirmación manual

## Comparativa: SQL vs TypeScript

| Aspecto | SQL | TypeScript |
|---------|-----|-----------|
| **Acceso** | Directo a BD | Por Prisma |
| **Complejidad** | Simple | Con dependencias |
| **Velocidad** | Muy rápida | Más lenta |
| **Reversible** | ROLLBACK antes de COMMIT | Transacción N/A |
| **Auditoría** | Fácil de revisar | Requiere logs |
| **Automatización** | Cron jobs o scripts shell | Node.js scripts |

**Recomendación:** Usa **SQL** si tienes acceso a `psql`; **TypeScript** si solo accedes por ORM/API.

## Casos de uso

### SQL: Limpiar usuario específico rápido
```bash
psql -h localhost -U usuario -d repositorio-rem <<EOF
SELECT * FROM limpiar_usuario('550e8400-e29b-41d4-a716-446655440000');
EOF
```

### SQL: Auditar antes de eliminar
```bash
psql -h localhost -U usuario -d repositorio-rem -c "
  SELECT * FROM contar_a_eliminar('550e8400-e29b-41d4-a716-446655440000');
"
```

### TypeScript: Limpiar usuarios de prueba
```bash
npx tsx scripts/limpiar-usuarios.ts
# Escribir: id1,id2,id3
# Revisar reporte
# Escribir: SÍ
```

### TypeScript: Limpiar ambiente de desarrollo
```bash
npx tsx scripts/limpiar-bd.ts --establecimiento dev-lab-id --reportar
# Ver qué se va a eliminar
npx tsx scripts/limpiar-bd.ts --establecimiento dev-lab-id
# Confirmar con ELIMINAR
```

### TypeScript: Auditar antes de limpiar
```bash
# Generar reporte sin modificar BD
npx tsx scripts/limpiar-bd.ts --usuarios id1,id2,id3 --reportar
```

## Variables de entorno

### Para scripts TypeScript (.ts)
Necesita `.env`:
```env
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/repositorio-rem
AUTH_SECRET=cualquier-valor
```

Se carga automáticamente (Prisma lo maneja).

### Para scripts SQL (.sql)
Usa credenciales de `psql`:
```bash
psql -h localhost -U usuario -d repositorio-rem -f script.sql
```

O variables de entorno:
```bash
PGHOST=localhost PGUSER=usuario PGDATABASE=repositorio-rem psql -f script.sql
```

## Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `not found` | Usuario no existe | Revisar el ID o RUT |
| `FK constraint` | Historial bloquea | Usar `--reportar` para ver qué |
| `DATABASE_URL not set` | Falta `.env` | Crear `.env` con `DATABASE_URL` |
| `UNIQUE constraint` | RUT/email duplicado | Revisar integridad de BD |

## Logs y auditoría

Los scripts **no** escriben en `logs/auditoria.txt` (cambios manuales en SQL directo).

### SQL: Ver cambios antes/después
```bash
# Antes de ejecutar:
SELECT COUNT(*) FROM usuario;

# Después:
SELECT COUNT(*) FROM usuario;
```

### TypeScript: Logs
Se escriben en consola durante la ejecución.

## Rollback

### SQL: Antes de COMMIT
```sql
ROLLBACK;  -- Deshacer todo
```

Descomenta `ROLLBACK;` en `limpiar-usuarios.sql` y comenta `COMMIT;` para hacer un "dry-run".

### SQL: Después de COMMIT
```bash
# Restaurar desde respaldo
pg_restore -h localhost -U usuario -d repositorio-rem respaldo.sql
```

### TypeScript: Después de eliminar
Solo queda restaurar de respaldo (las transacciones se commitean automáticamente).

## Respaldos recomendados

Antes de cualquier limpieza:

```bash
# Respaldo completo
pg_dump -h localhost -U usuario -d repositorio-rem > respaldo-completo.sql

# Solo estructura (sin datos)
pg_dump -h localhost -U usuario -d repositorio-rem -s > respaldo-estructura.sql

# Respaldo comprimido (recomendado para BD grande)
pg_dump -h localhost -U usuario -d repositorio-rem -F c -f respaldo.dump

# Restaurar desde comprimido
pg_restore -h localhost -U usuario -d repositorio-rem respaldo.dump
```

---

**Última actualización:** 2026-10-13
