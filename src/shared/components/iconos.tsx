"use client";

// Punto único de la iconografía del proyecto. Una sola familia (Phosphor) y un solo peso,
// para que ningún componente reinvente el tamaño ni el grosor de trazo. Antes había SVG
// dibujados a mano aquí; se reemplazaron por la librería.
import {
  CheckCircle,
  Eye,
  EyeSlash,
  Key,
  PencilSimple,
  Prohibit,
  type Icon,
} from "@phosphor-icons/react";

const PESO = "bold" as const;

// 16px para acciones dentro de una fila de tabla, 20px para controles dentro de un campo.
const TAMANO_ACCION = 16;
const TAMANO_CAMPO = 20;

type PropsIcono = { className?: string };

// Todos los iconos son decorativos: la etiqueta de texto siempre acompaña a la acción, así que
// marcarlos como imagen los haría redundantes para un lector de pantalla.
function crearIcono(Glifo: Icon, tamano: number) {
  return function IconoDecorativo({ className }: PropsIcono) {
    return <Glifo size={tamano} weight={PESO} aria-hidden="true" className={className} />;
  };
}

export const IconoEditar = crearIcono(PencilSimple, TAMANO_ACCION);
export const IconoContrasena = crearIcono(Key, TAMANO_ACCION);
export const IconoDesactivar = crearIcono(Prohibit, TAMANO_ACCION);
export const IconoActivar = crearIcono(CheckCircle, TAMANO_ACCION);

export const IconoOjo = crearIcono(Eye, TAMANO_CAMPO);
export const IconoOjoTachado = crearIcono(EyeSlash, TAMANO_CAMPO);
