// Formateadores compartidos: la fecha se formatea siempre en el servidor y con zona horaria fija
// (America/Santiago). Si la formateara el navegador, la hidratación mostraría un valor distinto
// según la zona del equipo del funcionario (mismo criterio ya usado en
// `shared/components/ListadoUsuarios.tsx` y `dashboard/logs/page.tsx`).

const FORMATEADOR_FECHA = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const FORMATEADOR_FECHA_HORA = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Para fechas "de calendario" sin componente horario real (p. ej. `VentanaCarga.fechaApertura` /
// `fechaVencimiento`, guardadas en UTC "de pared" — el mismo convenio usado al parsear fechas de
// archivo en `ValidadoresTipoDato.ts`): formatear con `timeZone: "America/Santiago"` las corre un
// día hacia atrás, porque esa zona está detrás de UTC. Se leen los componentes en UTC en vez de
// convertir a hora local.
const FORMATEADOR_FECHA_CALENDARIO = new Intl.DateTimeFormat("es-CL", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatearFecha(fecha: Date): string {
  return FORMATEADOR_FECHA.format(fecha);
}

export function formatearFechaHora(fecha: Date): string {
  return FORMATEADOR_FECHA_HORA.format(fecha);
}

export function formatearFechaCalendario(fecha: Date): string {
  return FORMATEADOR_FECHA_CALENDARIO.format(fecha);
}
