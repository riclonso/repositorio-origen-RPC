"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type PropsIcono = { className?: string };

type BotonIconoProps = {
  // Obligatoria: al no haber texto visible, esta etiqueta es el único nombre accesible que
  // recibe un lector de pantalla. Incluir a quién afecta la acción evita el clásico listado
  // de "Editar, Editar, Editar" sin contexto cuando se recorre la tabla.
  etiqueta: string;
  Icono: ComponentType<PropsIcono>;
  href?: string;
  onClick?: () => void;
  tono?: "neutro" | "peligro";
};

const CLASES_BASE =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2";

const CLASES_TONO = {
  neutro:
    "border-gob-accent bg-white text-gob-primary hover:border-gob-primary hover:bg-gob-neutral focus-visible:outline-gob-primary",
  peligro:
    "border-gob-accent bg-white text-gob-danger hover:border-gob-danger hover:bg-gob-danger/10 focus-visible:outline-gob-danger",
} as const;

export function BotonIcono({
  etiqueta,
  Icono,
  href,
  onClick,
  tono = "neutro",
}: BotonIconoProps): ReactNode {
  const clases = `${CLASES_BASE} ${CLASES_TONO[tono]}`;

  // `title` da la misma información al puntero que `aria-label` al lector de pantalla.
  if (href) {
    return (
      <Link href={href} aria-label={etiqueta} title={etiqueta} className={clases}>
        <Icono />
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta} className={clases}>
      <Icono />
    </button>
  );
}
