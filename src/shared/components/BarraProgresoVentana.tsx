// Barra de progreso de TIEMPO TRANSCURRIDO de una ventana de carga (RF-16, tablero de
// seguimiento): a diferencia de una barra de avance de tareas, esta se LLENA con el tiempo, no
// con trabajo completado. Server Component puro (sin estado ni interacción): el porcentaje ya
// viene resuelto desde `ObtenerResumenSeguimientoVentanasAbiertas`.
type BarraProgresoVentanaProps = {
  // 0..1, ya acotado por `calcularFraccionTiempoTranscurrido`.
  fraccionTiempoTranscurrido: number;
  // `true` cuando quedan pocos días para el vencimiento (`vencimientoProximo` del resumen):
  // cambia el color de la barra a la variante de alerta.
  enRiesgo: boolean;
};

export function BarraProgresoVentana({ fraccionTiempoTranscurrido, enRiesgo }: BarraProgresoVentanaProps) {
  const porcentaje = Math.round(fraccionTiempoTranscurrido * 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={porcentaje}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Tiempo transcurrido de la ventana de carga"
      className="h-2 w-full overflow-hidden rounded-full bg-gob-neutral"
    >
      <div
        // Ancho dinámico: no expresable como clase estática de Tailwind, de ahí el `style` inline.
        // `gob-danger` (rojo oscurecido, ~7.7:1 de contraste) en vez de `gob-secondary`: ese token
        // ya está documentado en el proyecto como insuficiente para contraste WCAG AA
        // (ver `docs/arquitectura.md`, sección "Contraste: el token `gob-danger`").
        className={`h-full rounded-full transition-[width] ${enRiesgo ? "bg-gob-danger" : "bg-gob-primary"}`}
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  );
}
