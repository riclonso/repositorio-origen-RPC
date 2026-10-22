import { env } from "@/infrastructure/config/env";
import { destinatarioUsuario, type DestinatarioFallaCorreo } from "@/infrastructure/logging/fallasCorreo";
import { CODIGO_PERFIL_REVISOR_REPOSITORIO } from "@/modules/perfiles/domain/entities/Perfil";
import {
  elegirDestinatariosEquipoRevisor,
  type DestinatarioEquipoRevisor,
} from "@/modules/usuarios/domain/entities/DestinatarioEquipoRevisor";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";

// RF-44: adaptador de infraestructura de la regla de destinatarios del equipo revisor. Es el único
// lugar que conoce `BUZON_COMPARTIDO_REVISOR_EMAIL`. Con buzón no consulta la BD; sin él, una sola
// consulta (incluye las cuentas activas que aún no fijaron contraseña).
export function buzonCompartidoEquipoRevisor(): string | null {
  return env.BUZON_COMPARTIDO_REVISOR_EMAIL ?? null;
}

// Cómo aparece un destinatario del equipo revisor en el registro de fallas de correo (RF-44).
export function aDestinatarioFallaCorreo(destinatario: DestinatarioEquipoRevisor): DestinatarioFallaCorreo {
  if (destinatario.tipo === "BUZON_COMPARTIDO") {
    return { tipo: "BUZON_COMPARTIDO", email: destinatario.email };
  }

  return destinatarioUsuario({
    id: destinatario.revisorId,
    nombres: destinatario.nombres,
    apellidos: destinatario.apellidos,
    rut: destinatario.rut,
    email: destinatario.email,
  });
}

// Destinatario que se puede registrar SIN consultar la BD (correo sin configurar o falla de
// preparación): el buzón si está configurado; si no, todavía no se sabe a qué revisores iría.
export function destinatarioEquipoRevisorSinConsultar(): DestinatarioFallaCorreo | null {
  const buzon = buzonCompartidoEquipoRevisor();
  return buzon ? { tipo: "BUZON_COMPARTIDO", email: buzon } : null;
}

export async function obtenerDestinatariosEquipoRevisor(): Promise<DestinatarioEquipoRevisor[]> {
  const buzon = buzonCompartidoEquipoRevisor();

  if (buzon) {
    return elegirDestinatariosEquipoRevisor(buzon, []);
  }

  const revisores = await prismaUsuarioRepository.listarActivosPorPerfil(CODIGO_PERFIL_REVISOR_REPOSITORIO);
  return elegirDestinatariosEquipoRevisor(null, revisores);
}
