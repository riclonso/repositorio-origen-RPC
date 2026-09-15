import { z } from "zod";
import { fechaDentroDelAnio } from "@/modules/ventanas-carga/domain/entities/rangoAnio";

// Rango amplio y razonable: no hay un límite de negocio documentado, solo una defensa contra un
// valor absurdo tecleado por error.
const ANIO_MINIMO = 2000;
const ANIO_MAXIMO = 2100;

export const anioVentanaCargaSchema = z.coerce
  .number()
  .int()
  .min(ANIO_MINIMO, `El año debe ser ${ANIO_MINIMO} o posterior`)
  .max(ANIO_MAXIMO, `El año debe ser ${ANIO_MAXIMO} o anterior`);

// Mismo esquema de validación de UUID que el resto de ids del proyecto (`idRutaSchema` en
// `app/api/_lib/http.ts`).
export const formatoExcelIdVentanaCargaSchema = z.uuid("Selecciona un formato de archivo válido");

const fechaVentanaCargaSchema = z.coerce.date("Ingresa una fecha válida");

// `fechaVencimiento` viaja como "AAAA-MM-DD" desde un `<input type="date">` y `z.coerce.date()` lo
// interpreta como medianoche UTC del día elegido. Sin normalizar, la ventana se cerraría a las
// 00:00 de ESE MISMO día en vez de cubrirlo completo — un cierre prematuro real de hasta ~24h, y
// además rechazaría como "fuera de rango" cualquier fila con `FECHA_HORA` de ese último día
// (`EvaluadorReglasValidacion.ts` compara contra el instante exacto, no contra el día calendario).
// Se ancla al final del día para que "vence el 31" signifique "vence al terminar el 31".
const fechaVencimientoVentanaCargaSchema = fechaVentanaCargaSchema.transform((fecha) => {
  const finDeDia = new Date(fecha);
  finDeDia.setUTCHours(23, 59, 59, 999);
  return finDeDia;
});

// Compartida entre creación y edición: ambas exigen que las dos fechas caigan dentro del año
// calendario de la ventana y que `fechaVencimiento` sea posterior a `fechaApertura`. Recibe el
// `anio` ya resuelto (del propio payload al crear, del registro existente al editar) para no
// duplicar la regla de rango en dos sitios.
function validarRangoVentana(
  datos: { anio: number; fechaApertura: Date; fechaVencimiento: Date },
  contexto: z.RefinementCtx,
): void {
  if (!fechaDentroDelAnio(datos.fechaApertura, datos.anio)) {
    contexto.addIssue({
      code: "custom",
      path: ["fechaApertura"],
      message: `La fecha de apertura debe estar dentro del año ${datos.anio}`,
    });
  }

  if (!fechaDentroDelAnio(datos.fechaVencimiento, datos.anio)) {
    contexto.addIssue({
      code: "custom",
      path: ["fechaVencimiento"],
      message: `La fecha de vencimiento debe estar dentro del año ${datos.anio}`,
    });
  }

  if (datos.fechaVencimiento <= datos.fechaApertura) {
    contexto.addIssue({
      code: "custom",
      path: ["fechaVencimiento"],
      message: "La fecha de vencimiento debe ser posterior a la fecha de apertura",
    });
  }
}

// Esquema de creación: `anio` y `formatoExcelId` viajan en el mismo payload que las fechas.
export const crearVentanaCargaSchema = z
  .object({
    anio: anioVentanaCargaSchema,
    fechaApertura: fechaVentanaCargaSchema,
    fechaVencimiento: fechaVencimientoVentanaCargaSchema,
    formatoExcelId: formatoExcelIdVentanaCargaSchema,
  })
  .superRefine(validarRangoVentana);
export type CrearVentanaCargaInput = z.infer<typeof crearVentanaCargaSchema>;

// Esquema de edición: el body real que envía el cliente son las dos fechas y el formato de
// archivo (`anio` es inmutable y nunca se recibe en la edición; `publicada` tiene su propio
// endpoint PATCH). La comprobación de rango contra el año se repite en
// `application/use-cases/EditarVentanaCarga.ts`, que sí conoce el año fijo de la ventana (lo
// resuelve leyendo el registro existente) — este esquema solo valida la FORMA del body.
export const editarVentanaCargaSchema = z.object({
  fechaApertura: fechaVentanaCargaSchema,
  fechaVencimiento: fechaVencimientoVentanaCargaSchema,
  formatoExcelId: formatoExcelIdVentanaCargaSchema,
});
export type EditarVentanaCargaInput = z.infer<typeof editarVentanaCargaSchema>;

// Esquema del endpoint dedicado a publicar/despublicar una ventana (RF-15 ampliación). Nunca
// viaja junto a fechas/formato: tiene su propio Route Handler PATCH.
export const cambiarPublicacionVentanaCargaSchema = z.object({ publicada: z.boolean() });
export type CambiarPublicacionVentanaCargaInput = z.infer<typeof cambiarPublicacionVentanaCargaSchema>;
