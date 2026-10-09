CREATE TABLE "lectura_notificacion" (
  "usuarioId" TEXT NOT NULL,
  "avisoId" VARCHAR(60) NOT NULL,
  "eventoFecha" TIMESTAMP(3) NOT NULL,
  "leidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lectura_notificacion_pkey" PRIMARY KEY ("usuarioId", "avisoId", "eventoFecha"),
  CONSTRAINT "lectura_notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
