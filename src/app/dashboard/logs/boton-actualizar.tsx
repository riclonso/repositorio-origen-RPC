"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/shared/components/Boton";

// Vuelve a pedir el Server Component: los logs se leen del disco en cada render, así que
// `router.refresh()` trae las entradas nuevas sin recargar toda la página.
export function BotonActualizar() {
  const router = useRouter();
  const [actualizando, iniciar] = useTransition();

  return (
    <Boton
      variante="secundario"
      cargando={actualizando}
      textoCargando="Actualizando..."
      onClick={() => iniciar(() => router.refresh())}
    >
      Actualizar
    </Boton>
  );
}
