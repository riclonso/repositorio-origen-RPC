import type { EstablecimientoOpcion } from "@/modules/establecimiento/domain/entities/Establecimiento";
import type { OpcionSelect } from "@/shared/components/CampoSelect";

// RF-30. Etiqueta única del establecimiento en los selects de usuarios (alta, edición y filtro del
// listado), en `/dashboard/usuarios` y `/revisor/usuarios`. Lleva el RUT porque dos establecimientos
// pueden compartir nombre. Mismo precedente que `opciones-perfil.ts`.
export function aOpcionesEstablecimiento(opciones: EstablecimientoOpcion[]): OpcionSelect[] {
  return opciones.map((opcion) => ({
    valor: opcion.id,
    etiqueta: `${opcion.nombre} · ${opcion.rut}${opcion.activo ? "" : " (inactivo)"}`,
  }));
}
