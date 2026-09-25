CREATE TABLE "registro_error_sistema" (
  "id" TEXT NOT NULL,
  "mensaje" TEXT NOT NULL,
  "campos" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "registro_error_sistema_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "registro_error_sistema_createdAt_idx" ON "registro_error_sistema"("createdAt");
