"use client";

import { PanelError } from "@/shared/components/PanelError";

export default function ErrorProvincias({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Provincias"
      mensaje="No se pudo cargar el catálogo de provincias."
      onReintentar={retry}
    />
  );
}
