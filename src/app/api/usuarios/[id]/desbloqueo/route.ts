import { NextResponse } from "next/server";
import { logger } from "@/infrastructure/logging/logger";
import { desbloquearUsuario } from "@/modules/usuarios/application/use-cases/DesbloquearUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { auditarUsuario } from "@/modules/usuarios/infrastructure/auditoria/auditarUsuario";
import {
  MENSAJE_ERROR_INTERNO,
  MENSAJE_NO_ENCONTRADO,
  exigirAdminORevisor,
  idUsuarioSchema,
  respuestaError,
  respuestaPerfilAdminRestringido,
  respuestaSinAcceso,
} from "@/app/api/usuarios/_lib/http";

// Desbloqueo MANUAL desde el mantenedor, para una cuenta con bloqueo vigente por intentos
// fallidos de login (ver `modules/auth/domain/entities/User.ts`, bloqueo progresivo).
export async function POST(request: Request, contexto: { params: Promise<{ id: string }> }) {
  const [{ id }, acceso] = await Promise.all([contexto.params, exigirAdminORevisor()]);

  if (!acceso.ok) {
    if (acceso.estado === 403) {
      auditarUsuario(acceso.sesion, request, {
        accion: "CUENTA_DESBLOQUEADA",
        resultado: "RECHAZADO",
        motivo: "SIN_PERMISO",
        usuarioObjetivoId: id,
      });
    }

    return respuestaSinAcceso(acceso.estado);
  }

  const idValido = idUsuarioSchema.safeParse(id);

  if (!idValido.success) {
    return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
  }

  try {
    const resultado = await desbloquearUsuario(idValido.data, acceso.sesion.perfil, new Date(), {
      repositorio: prismaUsuarioRepository,
    });

    if (!resultado.ok) {
      if (resultado.motivo === "PERFIL_ADMIN_RESTRINGIDO") {
        auditarUsuario(acceso.sesion, request, {
          accion: "CUENTA_DESBLOQUEADA",
          resultado: "RECHAZADO",
          motivo: "PERFIL_ADMIN_RESTRINGIDO",
          usuarioObjetivoId: idValido.data,
          usuarioObjetivoRut: resultado.rut,
        });

        return respuestaPerfilAdminRestringido();
      }

      if (resultado.motivo === "SIN_EFECTO") {
        // No es un rechazo: la cuenta ya no estaba bloqueada (venció sola o alguien más la
        // desbloqueó). Se audita igual que un rechazo, mismo criterio ya usado en RF-10, y se
        // responde éxito: hacia afuera es indistinguible de un desbloqueo real.
        auditarUsuario(acceso.sesion, request, {
          accion: "CUENTA_DESBLOQUEADA",
          resultado: "SIN_EFECTO",
          usuarioObjetivoId: idValido.data,
          usuarioObjetivoRut: resultado.rut,
        });

        return NextResponse.json({ ok: true });
      }

      auditarUsuario(acceso.sesion, request, {
        accion: "CUENTA_DESBLOQUEADA",
        resultado: "RECHAZADO",
        motivo: resultado.motivo,
        usuarioObjetivoId: idValido.data,
      });

      return respuestaError(MENSAJE_NO_ENCONTRADO, 404, { codigo: "NO_ENCONTRADO" });
    }

    auditarUsuario(acceso.sesion, request, {
      accion: "CUENTA_DESBLOQUEADA",
      resultado: "EXITO",
      usuarioObjetivoId: resultado.id,
      usuarioObjetivoRut: resultado.rut,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Error al desbloquear la cuenta de un usuario", {
      error: error instanceof Error ? error.message : String(error),
    });
    return respuestaError(MENSAJE_ERROR_INTERNO, 500);
  }
}
