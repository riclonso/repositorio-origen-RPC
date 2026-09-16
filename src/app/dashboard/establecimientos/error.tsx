"use client";

import { PanelError } from "@/shared/components/PanelError";

export default function ErrorEstablecimientos({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Establecimientos"
      mensaje="No se pudo cargar el listado de establecimientos."
      onReintentar={retry}
    />
  );
}
