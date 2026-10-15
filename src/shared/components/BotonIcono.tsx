"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { Tooltip } from "@/shared/components/Tooltip";

type PropsIcono = { className?: string };

type BotonIconoProps = {
  // Obligatoria: al no haber texto visible, esta etiqueta es el único nombre accesible que
  // recibe un lector de pantalla. Incluir a quién afecta la acción evita el clásico listado
  // de "Editar, Editar, Editar" sin contexto cuando se recorre la tabla.
  etiqueta: string;
  Icono: ComponentType<PropsIcono>;
  href?: string;
  onClick?: () => void;
  tono?: "neutro" | "primario" | "exito" | "azul" | "peligro";
  // Solo aplica a la variante botón (sin `href`). `motivoDeshabilitado` reemplaza al `title`
  // mientras está deshabilitado, para explicar al puntero por qué no está disponible.
  deshabilitado?: boolean;
  motivoDeshabilitado?: string;
  // Tamaño mayor (48px) para acciones flotantes que deben destacar sobre el contenido.
  grande?: boolean;
};

const CLASES_BASE =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2";

const CLASES_GRANDE = "h-12 w-12";

const CLASES_TONO = {
  neutro:
    "border-gob-accent bg-white text-gob-primary hover:border-gob-primary hover:bg-gob-neutral focus-visible:outline-gob-primary",
  primario:
    "border-gob-primary bg-gob-primary text-white hover:bg-gob-primary-oscuro focus-visible:outline-gob-primary",
  // Confirmaciones compactas: contorno e icono verde sobre fondo blanco, para diferenciarlas de
  // una acción primaria de navegación sin perder el significado positivo de la aprobación.
  exito:
    "border-gob-success bg-white text-gob-success hover:bg-gob-success/10 focus-visible:outline-gob-success",
  // Azul del encabezado del panel de administración (`#173b69`, ver `EncabezadoPanel`), en
  // contorno como el resto de iconos de este componente.
  azul:
    "border-[#173b69] bg-white text-[#173b69] hover:bg-[#173b69]/10 focus-visible:outline-[#173b69]",
  peligro:
    "border-gob-accent bg-white text-gob-danger hover:border-gob-danger hover:bg-gob-danger/10 focus-visible:outline-gob-danger",
} as const;

// Mismo trato visual que el botón de eliminar deshabilitado de `TablaFormatosExcel`.
const CLASES_DESHABILITADO =
  "disabled:cursor-not-allowed disabled:border-gob-accent disabled:text-gob-gray-a disabled:hover:bg-transparent disabled:active:translate-y-0";

export function BotonIcono({
  etiqueta,
  Icono,
  href,
  onClick,
  tono = "neutro",
  deshabilitado = false,
  motivoDeshabilitado,
  grande = false,
}: BotonIconoProps): ReactNode {
  const clases = `${CLASES_BASE} ${grande ? CLASES_GRANDE : ""} ${CLASES_TONO[tono]}`;

  // El tooltip da la misma información al puntero que `aria-label` al lector de pantalla.
  if (href) {
    return (
      <Tooltip texto={etiqueta}>
        <Link href={href} aria-label={etiqueta} className={clases}>
          <Icono />
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip texto={deshabilitado && motivoDeshabilitado ? motivoDeshabilitado : etiqueta}>
      <button
        type="button"
        onClick={onClick}
        disabled={deshabilitado}
        aria-label={etiqueta}
        className={`${clases} ${CLASES_DESHABILITADO}`}
      >
        <Icono />
      </button>
    </Tooltip>
  );
}
