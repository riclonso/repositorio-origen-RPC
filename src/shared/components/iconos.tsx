"use client";

// Punto único de la iconografía del proyecto. Una sola familia (Phosphor) y un solo peso,
// para que ningún componente reinvente el tamaño ni el grosor de trazo. Antes había SVG
// dibujados a mano aquí; se reemplazaron por la librería.
import {
  Archive,
  Check,
  CheckCircle,
  Circle,
  Eye,
  EyeSlash,
  Gear,
  Key,
  LinkSimple,
  ListBullets,
  Lock,
  LockOpen,
  PencilSimple,
  Prohibit,
  SealCheck,
  TextB,
  TextItalic,
  Trash,
  UploadSimple,
  User,
  WarningCircle,
  X,
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
export const IconoEliminar = crearIcono(Trash, TAMANO_ACCION);
// Archivar/desarchivar una ventana de carga: mismo icono para ambas direcciones, mismo criterio
// que `IconoEliminar` (el texto del botón, no el icono, distingue la acción).
export const IconoArchivar = crearIcono(Archive, TAMANO_ACCION);

// Requisitos de contraseña: el icono cambia de forma, no solo de color, porque el color no
// puede ser el único portador de la información.
export const IconoCumplido = crearIcono(Check, 14);
export const IconoPendiente = crearIcono(Circle, 14);
export const IconoNoCumplido = crearIcono(X, 14);

export const IconoOjo = crearIcono(Eye, TAMANO_CAMPO);
export const IconoOjoTachado = crearIcono(EyeSlash, TAMANO_CAMPO);

// Ícono izquierdo de los campos de RUT y contraseña en las pantallas públicas (login,
// recuperación): refuerza qué tipo de dato se pide sin agregar texto adicional.
export const IconoUsuario = crearIcono(User, TAMANO_CAMPO);
export const IconoCandado = crearIcono(Lock, TAMANO_CAMPO);

// Estado de error en formularios públicos: el ícono, no solo el color, marca la alerta.
export const IconoAdvertencia = crearIcono(WarningCircle, TAMANO_CAMPO);

// RF-14: carga y validación de archivos de reporte.
export const IconoSubir = crearIcono(UploadSimple, TAMANO_CAMPO);
export const IconoAprobado = crearIcono(SealCheck, TAMANO_ACCION);

// RF-17: barra del editor de texto enriquecido de la plantilla de alerta
// (`EditorTextoEnriquecidoLimitado`).
export const IconoNegrita = crearIcono(TextB, TAMANO_ACCION);
export const IconoCursiva = crearIcono(TextItalic, TAMANO_ACCION);
export const IconoListaVinetas = crearIcono(ListBullets, TAMANO_ACCION);
export const IconoEnlace = crearIcono(LinkSimple, TAMANO_ACCION);

// Disparador del menú "Mi perfil / Cambiar contraseña" del encabezado de cada panel
// (`MenuConfiguracionUsuario`). Es un botón con texto oculto (`sr-only`) que lo acompaña, así
// que sigue siendo decorativo.
export const IconoConfiguracion = crearIcono(Gear, TAMANO_CAMPO);
// Acción "Desbloquear cuenta" del mantenedor de usuarios, sobre una fila con bloqueo por
// intentos fallidos vigente.
export const IconoDesbloquear = crearIcono(LockOpen, TAMANO_ACCION);
