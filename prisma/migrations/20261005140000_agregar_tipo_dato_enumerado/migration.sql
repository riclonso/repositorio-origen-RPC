-- Tipos de dato enumerados definidos por el usuario (paso 1 de 2).
-- Va sola en su propia migración: PostgreSQL no permite USAR un valor de enum recién agregado
-- dentro de la misma transacción en que se agregó, y la migración siguiente lo usa en un CHECK.
ALTER TYPE "TipoDatoColumna" ADD VALUE 'ENUMERADO';
