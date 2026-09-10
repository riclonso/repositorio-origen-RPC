import { z } from "zod";
import { FORMA_CODIGO_PERFIL } from "@/modules/perfiles/domain/entities/Perfil";

// Valida FORMA, nunca pertenencia a una lista cerrada: los perfiles son filas de la tabla
// `perfil` y una lista fija aquí reintroduciría el acoplamiento que el catálogo elimina.
// La existencia del perfil la comprueba el caso de uso contra el repositorio.
export const MENSAJE_PERFIL_INVALIDO = "Selecciona un perfil válido";

export const codigoPerfilSchema = z
  .string()
  .trim()
  .regex(FORMA_CODIGO_PERFIL, MENSAJE_PERFIL_INVALIDO);
