import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteBoton = "primario" | "secundario" | "peligro" | "texto" | "textoPeligro";

type BotonProps = {
  variante?: VarianteBoton;
  cargando?: boolean;
  textoCargando?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

// Centraliza contraste, foco visible y feedback táctil para todos los botones del sistema.
// disabled usa un gris solido y no opacidad: opacity-70 sobre el azul primario caia a ~3.1:1
// y no alcanzaba el minimo AA para el texto del boton.
const CLASES_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-gob-accent disabled:bg-gob-neutral disabled:text-gob-gray-a disabled:active:translate-y-0";

const CLASES_VARIANTE: Record<VarianteBoton, string> = {
  primario:
    "px-4 py-2 bg-gob-primary text-white hover:bg-gob-primary-oscuro focus-visible:outline-gob-primary",
  secundario:
    "px-4 py-2 border border-gob-accent bg-white text-gob-gray-a hover:bg-gob-neutral focus-visible:outline-gob-primary",
  peligro: "px-4 py-2 bg-gob-danger text-white hover:brightness-90 focus-visible:outline-gob-danger",
  // Variantes de texto para acciones dentro de una fila de tabla: al ser varias por fila,
  // rellenarlas convertiria la accion destructiva en el elemento mas ruidoso de la pantalla.
  texto:
    "gap-1 px-1 py-1 text-gob-primary hover:bg-gob-neutral hover:underline underline-offset-2 focus-visible:outline-gob-primary disabled:bg-transparent",
  textoPeligro:
    "gap-1 px-1 py-1 text-gob-danger hover:bg-gob-danger/10 hover:underline underline-offset-2 focus-visible:outline-gob-danger disabled:bg-transparent",
};

export function Boton({
  variante = "primario",
  cargando = false,
  textoCargando,
  disabled,
  className = "",
  children,
  type = "button",
  ...atributos
}: BotonProps) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`${CLASES_BASE} ${CLASES_VARIANTE[variante]} ${className}`}
      {...atributos}
    >
      {cargando && textoCargando ? textoCargando : children}
    </button>
  );
}
