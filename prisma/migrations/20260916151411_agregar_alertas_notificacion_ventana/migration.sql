-- RF-17: alertas por email a notificadores (NOTIFICADOR_RPC) que no han reportado su archivo en
-- una ventana de carga, configurable por ventana, con envío automático y manual.
--
-- `plantillaAlerta` nace NOT NULL pero `ventana_carga` ya tiene filas (entorno de desarrollo
-- local), así que se agrega NULLABLE primero, se backfillea con el texto de
-- `PLANTILLA_ALERTA_POR_DEFECTO_HTML` (`modules/ventanas-carga/domain/entities/PlantillaAlerta.ts`)
-- para las filas existentes, y luego se fuerza NOT NULL. Mismo mecanismo de 3 pasos ya usado en
-- `20260915140000_ventana_carga_formato_excel`/`20260914180209_ventanas_carga_rf15`.

-- CreateEnum
CREATE TYPE "TipoAlertaNotificacion" AS ENUM ('AUTOMATICA', 'MANUAL_MASIVA', 'MANUAL_INDIVIDUAL');

-- CreateEnum
CREATE TYPE "ResultadoAlertaNotificacion" AS ENUM ('EXITO', 'ERROR');

-- AlterTable: columnas de configuración nullables (ambas o ninguna, regla de `application/`, no
-- expresable como CHECK sin admitir NULL individual) y `plantillaAlerta` NULLABLE por ahora.
ALTER TABLE "ventana_carga" ADD COLUMN     "diasAnticipacionInicio" INTEGER,
ADD COLUMN     "intervaloRepeticionDias" INTEGER,
ADD COLUMN     "plantillaAlerta" TEXT;

-- Backfill: toda ventana existente nace con la plantilla por defecto, exactamente el mismo HTML
-- que `PLANTILLA_ALERTA_POR_DEFECTO_HTML` produce para una ventana creada después de esta
-- migración, para que el histórico y lo nuevo no diverjan.
UPDATE "ventana_carga" SET "plantillaAlerta" = '<p>Hola {{nombreUsuario}},</p>
<p>Te recordamos que aún no has reportado tu archivo de tipo <strong>{{formatoArchivo}}</strong> correspondiente al año {{anio}}.</p>
<p>Quedan <strong>{{diasRestantes}}</strong> día(s) para el cierre del período de carga.</p>
<ul>
  <li>Sube tu archivo antes de la fecha de cierre.</li>
</ul>
<p><a href="{{enlaceSistema}}">Ingresa aquí</a> para reportar tu archivo.</p>
<p>Este es un mensaje automático. No respondas a esta dirección.</p>'
WHERE "plantillaAlerta" IS NULL;

-- AlterTable: ahora que todas las filas tienen un valor, se exige NOT NULL.
ALTER TABLE "ventana_carga" ALTER COLUMN "plantillaAlerta" SET NOT NULL;

-- CreateTable
CREATE TABLE "alerta_notificacion_ventana" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "ventanaCargaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" "TipoAlertaNotificacion" NOT NULL,
    "resultado" "ResultadoAlertaNotificacion" NOT NULL,
    "asunto" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "detalleError" TEXT,
    "disparadoPorId" TEXT,
    "fechaProgramada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerta_notificacion_ventana_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "alerta_notificacion_ventana" ADD CONSTRAINT "alerta_notificacion_ventana_ventanaCargaId_fkey" FOREIGN KEY ("ventanaCargaId") REFERENCES "ventana_carga"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_notificacion_ventana" ADD CONSTRAINT "alerta_notificacion_ventana_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_notificacion_ventana" ADD CONSTRAINT "alerta_notificacion_ventana_disparadoPorId_fkey" FOREIGN KEY ("disparadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex (a mano, no generado por Prisma: expresa un WHERE, que el DSL de Prisma no permite).
-- Deduplica el envío automático: para un mismo (ventana, usuario, día calendario programado) solo
-- puede existir una fila EXITO. `crearLote` usa `skipDuplicates: true`, que absorbe en silencio
-- cualquier colisión contra este índice en una carrera entre dos ejecuciones del ciclo.
CREATE UNIQUE INDEX "alerta_notificacion_ventana_dedupe_automatica"
  ON "alerta_notificacion_ventana" ("ventanaCargaId", "usuarioId", "fechaProgramada")
  WHERE "tipo" = 'AUTOMATICA' AND "resultado" = 'EXITO';
