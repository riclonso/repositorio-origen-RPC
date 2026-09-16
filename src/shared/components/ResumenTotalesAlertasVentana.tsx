export type TotalAlertaVista = {
  tipo: "AUTOMATICA" | "MANUAL_MASIVA" | "MANUAL_INDIVIDUAL";
  resultado: "EXITO" | "ERROR";
  cantidad: number;
};

const ETIQUETA_TIPO: Record<TotalAlertaVista["tipo"], string> = {
  AUTOMATICA: "Automáticos",
  MANUAL_MASIVA: "Manuales (masivo)",
  MANUAL_INDIVIDUAL: "Manuales (individual)",
};

type ResumenTotalesAlertasVentanaProps = {
  totales: TotalAlertaVista[];
};

// RF-17: franja de totales agregados (por tipo y resultado) sobre TODO el historial de la
// ventana, no solo la página actual del listado. Server Component puro: los totales ya llegan
// calculados desde `obtenerTotalesPorVentana` (un solo `groupBy`, nunca contados en cliente).
export function ResumenTotalesAlertasVentana({ totales }: ResumenTotalesAlertasVentanaProps) {
  if (totales.length === 0) {
    return <p className="text-sm text-gob-gray-a">Todavía no se ha enviado ninguna alerta en esta ventana.</p>;
  }

  return (
    <div className="flex flex-wrap gap-3" role="list" aria-label="Totales de alertas enviadas">
      {totales.map((total) => (
        <div
          key={`${total.tipo}-${total.resultado}`}
          role="listitem"
          className={`rounded-md border px-3 py-2 text-sm ${
            total.resultado === "EXITO"
              ? "border-gob-primary/40 bg-gob-primary/5 text-gob-primary"
              : "border-gob-danger/40 bg-gob-danger/5 text-gob-danger"
          }`}
        >
          <span className="font-semibold tabular-nums">{total.cantidad}</span> {ETIQUETA_TIPO[total.tipo]} ·{" "}
          {total.resultado === "EXITO" ? "éxito" : "error"}
        </div>
      ))}
    </div>
  );
}
