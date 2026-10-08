-- D1 (M1b): los binarios de las cargas del notificador pasan a disco. Migración ADITIVA: la base sigue
-- admitiendo el código anterior mientras no existan filas con los valores nuevos (ver sección 14 del
-- diseño D1). `contenidoArchivo` NO se elimina aquí (D3, tras migrar y respaldar).

-- AlterTable
ALTER TABLE "carga_archivo" ADD COLUMN     "rutaArchivo" TEXT,
ADD COLUMN     "sha256" CHAR(64),
ADD COLUMN     "tamanoBytes" INTEGER,
ALTER COLUMN "contenidoArchivo" DROP NOT NULL;

-- CHECK (agregado a mano: Prisma no expresa CHECKs). Toda carga conserva su binario en alguna parte:
-- en la base (cargas antiguas no migradas) o en disco con su tamaño y SHA-256. Las filas existentes
-- lo cumplen porque `contenidoArchivo` era NOT NULL.
ALTER TABLE "carga_archivo" ADD CONSTRAINT "carga_archivo_binario_presente"
  CHECK ("contenidoArchivo" IS NOT NULL OR ("rutaArchivo" IS NOT NULL AND "tamanoBytes" IS NOT NULL AND "sha256" IS NOT NULL));

-- CreateIndex (agregado a mano: índice único parcial, mismo mecanismo que
-- `carga_archivo_pendiente_finalizada_key`). A lo más UN procesamiento en curso por combinación
-- (usuario, ventana): dos subidas simultáneas que pasen el chequeo previo chocan aquí con P2002, que
-- `PrismaCargaArchivoRepository.crearProcesando` traduce a `EN_PROCESO`. No hay filas PROCESANDO
-- antes de esta migración (el valor de enum es nuevo).
CREATE UNIQUE INDEX "carga_archivo_procesando_key"
  ON "carga_archivo" ("usuarioId", "ventanaCargaId")
  WHERE "estado" = 'PROCESANDO';
