import type { EstadoCargaArchivo } from "@/modules/reporte-excel/domain/entities/CargaArchivo";

// Etiqueta humana de cada estado de carga (RF-14), compartida entre "Mis cargas"
// (`panel-carga-archivo.tsx`) y el detalle de una carga propia (`DetalleCargaPropia.tsx`): un único
// lugar evita que ambas vistas del mismo dato diverjan.
export const ETIQUETAS_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "Con errores",
  PENDIENTE_VISTO_BUENO: "Pendiente de Aprobación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
};

// Clases Tailwind por estado, compartidas entre `panel-carga-archivo.tsx` y
// `shared/components/BadgeEstadoCarga.tsx`: un único lugar evita que la paleta de cada estado
// diverja entre vistas.
export const CLASES_ESTADO: Record<EstadoCargaArchivo, string> = {
  CON_ERRORES: "bg-gob-danger text-white border-gob-danger",
  PENDIENTE_VISTO_BUENO: "bg-gob-success text-white border-gob-success",
  APROBADA: "bg-gob-primary text-white border-gob-primary",
  RECHAZADA: "bg-gob-danger text-white border-gob-danger",
};

// Variante visual de una `APROBADA` ya superada por un reemplazo (su publicación quedó
// desactivada): no es un estado persistido propio, se deriva de la publicación. Tonos neutros para
// que no se confunda con la aprobación vigente.
export const ETIQUETA_REEMPLAZADA = "Reemplazada";
export const CLASES_REEMPLAZADA = "bg-gob-neutral text-gob-gray-a border-gob-gray-b";

// Variante de una `APROBADA` vigente con un reemplazo en curso (solicitud aprobada sin usar, archivo
// de reemplazo pendiente o rechazado con reapertura vigente). Derivada, no persistida. Contorno en
// vez de relleno para distinguirla de la aprobación sin reemplazo.
export const ETIQUETA_EN_REEMPLAZO = "Se solicita reemplazo";
export const CLASES_EN_REEMPLAZO = "bg-white text-gob-primary border-gob-primary";
