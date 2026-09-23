-- Nuevo (rechazo de cargas aprobadas): el valor de enum se agrega en su PROPIA migración, separada
-- de cualquier ALTER TABLE/UPDATE que lo use, porque PostgreSQL no permite usar un valor de enum
-- recién agregado dentro de la misma transacción que lo crea. Mismo mecanismo ya usado en
-- `20260917142311_agregar_regla_fila_duplicada`.

-- AlterEnum
ALTER TYPE "EstadoCargaArchivo" ADD VALUE 'RECHAZADA';
