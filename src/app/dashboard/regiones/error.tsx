"use client";

import { PanelError } from "@/shared/components/PanelError";

export default function ErrorRegiones({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Regiones"
      mensaje="No se pudo cargar el catálogo de regiones."
      onReintentar={retry}
    />
  );
}
