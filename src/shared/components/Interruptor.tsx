"use client";

type InterruptorProps = {
  activado: boolean;
  // Nombre accesible del control. El texto visible que lo acompaña ("Activo" / "Inactivo")
  // describe el estado, no qué cuenta se está cambiando, así que hace falta igual.
  etiqueta: string;
  onCambiar: () => void;
  bloqueado?: boolean;
  idDescripcion?: string;
  // Texto que ve el puntero al posarse sobre el control. Se usa para explicar por qué está
  // bloqueado: sin él, el motivo solo llegaba al lector de pantalla y quien usa el ratón se
  // encontraba con un interruptor que no responde y ninguna explicación.
  tooltip?: string;
};

// `role="switch"` con `aria-checked` es lo que hace que un lector de pantalla anuncie
// "activado / desactivado" en vez de leerlo como un botón cualquiera.
export function Interruptor({
  activado,
  etiqueta,
  onCambiar,
  bloqueado = false,
  idDescripcion,
  tooltip,
}: InterruptorProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activado}
      aria-label={etiqueta}
      // Se usa el `title` nativo y no un tooltip propio porque el contenedor de la tabla tiene
      // `overflow-x-auto`, que recorta cualquier elemento posicionado que se salga de sus
      // límites. El tooltip nativo se dibuja por encima de todo y nunca queda cortado.
      title={tooltip}
      // `aria-disabled` en vez de `disabled`: el control conserva el foco y el lector puede
      // anunciar el motivo del bloqueo, cosa que un `disabled` real impide.
      aria-disabled={bloqueado || undefined}
      aria-describedby={idDescripcion}
      onClick={bloqueado ? undefined : onCambiar}
      // El color del riel lo decide SIEMPRE el estado real de la cuenta. El bloqueo solo se
      // expresa con opacidad y cursor: si pintara el riel de gris, un interruptor bloqueado
      // sobre una cuenta activa se leería como apagado, que es justo lo contrario.
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary ${
        activado ? "border-gob-primary bg-gob-primary" : "border-gob-gray-b bg-white"
      } ${bloqueado ? "cursor-not-allowed opacity-60" : ""}`}
    >
      {/* El desplazamiento del botón es retroalimentación de cambio de estado, el único tipo de
          movimiento que corresponde con MOTION_INTENSITY 2. */}
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 rounded-full transition-transform duration-150 ${
          activado ? "translate-x-4.5 bg-white" : "translate-x-0.5 bg-gob-gray-b"
        }`}
      />
    </button>
  );
}
