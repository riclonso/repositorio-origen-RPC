// Gráfico de torta de "reportaron vs total" (RF-16, tablero de seguimiento), sin librería nueva:
// un círculo con `conic-gradient` CSS. Server Component puro, sin estado ni interacción.
type GraficoTortaProporcionProps = {
  completado: number;
  total: number;
};

export function GraficoTortaProporcion({ completado, total }: GraficoTortaProporcionProps) {
  if (total === 0) {
    return (
      <p className="text-sm text-gob-gray-a">Sin notificadores asignados a este formato.</p>
    );
  }

  const porcentaje = Math.round((completado / total) * 100);
  const angulo = (completado / total) * 360;

  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden="true"
        className="h-16 w-16 shrink-0 rounded-full"
        // Ángulo dinámico: no expresable como clase estática de Tailwind, de ahí el `style`
        // inline. `gob-primary` para la porción que ya reportó, `gob-neutral` para el resto.
        style={{
          background: `conic-gradient(var(--color-gob-primary) 0deg ${angulo}deg, var(--color-gob-neutral) ${angulo}deg 360deg)`,
        }}
      />
      {/* Leyenda textual: el color no es el único portador de la información (accesibilidad). */}
      <div className="text-sm text-gob-gray-a">
        <p className="font-semibold text-gob-black">{porcentaje}% reportó</p>
        <p>
          {completado} de {total} notificadores
        </p>
      </div>
    </div>
  );
}
