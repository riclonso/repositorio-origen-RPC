"use client";

import { PanelError } from "@/shared/components/PanelError";

// No se muestra el detalle del error: puede contener información interna del sistema.
export default function ErrorUsuarios({ retry }: { error: Error; retry: () => void }) {
  return (
    <PanelError
      titulo="Usuarios"
      mensaje="No se pudo cargar el padrón de usuarios."
      onReintentar={retry}
    />
  );
}
