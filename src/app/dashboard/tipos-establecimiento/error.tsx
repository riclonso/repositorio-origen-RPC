"use client";

import { PanelError } from "@/shared/components/PanelError";

export default function ErrorTipos({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Tipos de establecimiento"
      mensaje="No se pudo cargar el catálogo de tipos."
      onReintentar={retry}
    />
  );
}
