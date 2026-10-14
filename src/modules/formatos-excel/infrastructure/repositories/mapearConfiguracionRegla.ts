import {
  configuracionAnioDentroDeRangoSchema,
  configuracionComparacionAnioVentanaSchema,
  configuracionComparacionFechasSchema,
} from "@/modules/formatos-excel/schemas/formato-excel.schema";
import type {
  ConfiguracionReglaValidacion,
  TipoReglaValidacion,
} from "@/modules/formatos-excel/domain/entities/FormatoExcel";

// Lectura del JSON `configuracion` persistido de una regla. Módulo puro (sin Prisma) para poder
// probarlo directamente. Cada tipo con configuración se enruta explícitamente a su esquema; un
// JSON que no calza lanza (dato corrupto). Sin configuración guardada (`null`) siempre devuelve
// `null`, sea cual sea el tipo. Un tipo que no admite configuración pero trae JSON guardado lanza.
// El ajuste 0 de `desplazamientoAnios` lo descarta el propio esquema de `COMPARACION_ANIO_VENTANA`.
export function aConfiguracionRegla(tipo: TipoReglaValidacion, configuracion: unknown): ConfiguracionReglaValidacion | null {
  if (configuracion === null || configuracion === undefined) return null;
  switch (tipo) {
    case "FECHA_POSTERIOR_O_IGUAL":
      return configuracionComparacionFechasSchema.parse(configuracion);
    case "COMPARACION_ANIO_VENTANA":
      return configuracionComparacionAnioVentanaSchema.parse(configuracion);
    case "ANIO_DENTRO_DE_RANGO_VENTANA":
      return configuracionAnioDentroDeRangoSchema.parse(configuracion);
    default:
      throw new Error(`La regla de tipo ${tipo} no admite configuración`);
  }
}
