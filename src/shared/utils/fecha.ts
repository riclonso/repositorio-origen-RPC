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

// --- Conversión entre instantes reales y la hora "de pared" de Chile ---
//
// Las fechas de una ventana de carga se guardan como hora de pared de Chile escrita en UTC
// ("vence el 31-12" = `…-12-31T23:59:59.999Z`). Para compararlas con un instante real (`new Date()`,
// `rechazadoEn`, …) hay que llevar ambos al mismo sistema: si no, la ventana cierra a las 23:59 UTC,
// que en Chile son las 20:59 (o 19:59 en horario de invierno).

const FORMATEADOR_PARTES_CHILE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Santiago",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

// Diferencia (ms) entre la hora de pared de Chile y UTC en ese instante: negativa, -3h o -4h según
// el horario de verano/invierno vigente.
function desfaseChileMs(instante: Date): number {
  const partes = Object.fromEntries(
    FORMATEADOR_PARTES_CHILE.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  );
  const paredComoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
    instante.getUTCMilliseconds(),
  );
  return paredComoUtc - instante.getTime();
}

// Instante real → hora de pared de Chile escrita en UTC (mismo sistema que las fechas de ventana).
export function instanteAParedChile(instante: Date): Date {
  return new Date(instante.getTime() + desfaseChileMs(instante));
}

// Hora de pared de Chile escrita en UTC → instante real. Se recalcula el desfase en el instante
// estimado para acertar también en los días de cambio de horario.
export function paredChileAInstante(pared: Date): Date {
  const estimado = pared.getTime() - desfaseChileMs(pared);
  return new Date(pared.getTime() - desfaseChileMs(new Date(estimado)));
}

// Instante real de las 23:59:59.999 (hora de Chile) del día en que ocurre `instante`, desplazado
// `diasExtra` días de calendario. Base de los plazos "N días" que deben vencer al terminar el día.
export function finDelDiaChile(instante: Date, diasExtra = 0): Date {
  const pared = instanteAParedChile(instante);
  pared.setUTCDate(pared.getUTCDate() + diasExtra);
  pared.setUTCHours(23, 59, 59, 999);
  return paredChileAInstante(pared);
}
