"use client";

import { PanelError } from "@/shared/components/PanelError";

export default function ErrorComunas({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Comunas"
      mensaje="No se pudo cargar el catálogo de comunas."
      onReintentar={retry}
    />
  );
}
