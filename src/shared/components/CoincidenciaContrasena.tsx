"use client";

import {
  MENSAJE_COINCIDENCIA_CONTRASENA,
  MENSAJE_CONFIRMACION_CONTRASENA,
} from "@/shared/schemas/contrasena.schema";
import { IconoCumplido, IconoNoCumplido } from "@/shared/components/iconos";

type CoincidenciaContrasenaProps = {
  contrasena: string;
  confirmacion: string;
  id?: string;
};

export function CoincidenciaContrasena({
  contrasena,
  confirmacion,
  id,
}: CoincidenciaContrasenaProps) {
  // Mientras el campo esté vacío no se dice nada: avisar "no coinciden" a quien todavía no ha
  // escrito nada es regañar por adelantado. El aviso aparece con la primera tecla.
  if (confirmacion.length === 0) {
    return null;
  }

  const coinciden = contrasena === confirmacion;

  return (
    <p
      id={id}
      aria-live="polite"
      className={`mt-2 flex items-center gap-1.5 text-xs ${
        coinciden ? "font-medium text-gob-success" : "font-medium text-gob-danger"
      }`}
    >
      {/* Igual que en la lista de requisitos: cambia la forma del icono además del color, para
          no dejar la información solo en el color. */}
      {coinciden ? <IconoCumplido /> : <IconoNoCumplido />}
      {coinciden ? MENSAJE_COINCIDENCIA_CONTRASENA : MENSAJE_CONFIRMACION_CONTRASENA}
    </p>
  );
}
