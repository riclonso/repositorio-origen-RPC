import { env, configSmtp } from "@/infrastructure/config/env";
import { correoDisponible, enviarCorreo } from "@/infrastructure/email/SmtpMailer";
import { CODIGO_PERFIL_REVISOR_REPOSITORIO } from "@/modules/perfiles/domain/entities/Perfil";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import type {
  DatosCorreoConfirmacionVistoBueno,
  EnviadorConfirmacionVistoBueno,
} from "@/modules/reporte-excel/application/ports";

// Confirmación de carga aprobada (RF nuevo): un correo al notificador dueño de la carga y otro al
// "buzón compartido" del equipo revisor. Plantilla FIJA, mismo patrón de construcción que
// `SolicitudReemplazoMailer.ts`/`RechazoCargaMailer.ts`.

const ASUNTO = "Carga de archivo aprobada - Repositorio RPC - SEREMI de Salud Biobío";

const CABECERAS = {
  "Auto-Submitted": "auto-generated",
  "X-Auto-Response-Suppress": "All",
};

function primerNombre(nombres: string): string {
  return nombres.trim().split(/\s+/)[0] ?? "";
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Copia = Omit<DatosCorreoConfirmacionVistoBueno, "notificador">;

function cuerpoTexto(saludo: string, enlace: string, copia: Copia): string {
  const combinacion = `${copia.formatoExcelNombre} (${copia.anio})`;

  return `${saludo}

La carga "${copia.nombreArchivoOriginal}" de ${combinacion} fue aprobada y ya está publicada.

Revisa el detalle en: ${enlace}

Este es un mensaje automático. No respondas a esta dirección.
`;
}

function cuerpoHtml(saludo: string, enlace: string, copia: Copia): string {
  const enlaceSeguro = escaparHtml(enlace);
  const combinacion = `${escaparHtml(copia.formatoExcelNombre)} (${copia.anio})`;

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background-color:#eeeeee;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #a8b7c7;border-radius:8px;padding:24px;">
      <p style="margin:0 0 16px;font-size:15px;">${escaparHtml(saludo)}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
        La carga "<strong>${escaparHtml(copia.nombreArchivoOriginal)}</strong>" de ${combinacion} fue aprobada y ya
        está publicada.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${enlaceSeguro}" style="display:inline-block;background-color:#006fb3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
          Ir al sistema
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#4a4a4a;">
        Este es un mensaje automático. No respondas a esta dirección.
      </p>
    </div>
  </body>
</html>
`;
}

async function enviarACorreo(para: string, saludo: string, enlace: string, copia: Copia): Promise<void> {
  await enviarCorreo({
    para,
    asunto: ASUNTO,
    texto: cuerpoTexto(saludo, enlace, copia),
    html: cuerpoHtml(saludo, enlace, copia),
    cabeceras: CABECERAS,
  });
}

export const vistoBuenoCargaMailer: EnviadorConfirmacionVistoBueno = {
  disponible: () => correoDisponible(),

  async enviarConfirmacionNotificador(datos) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const nombre = primerNombre(datos.notificador.nombres);
    const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
    const enlace = `${configSmtp.urlBase}/notificador`;

    await enviarACorreo(datos.notificador.email, saludo, enlace, datos);
  },

  async enviarConfirmacionRevisores(datos) {
    if (!configSmtp) {
      throw new Error("El envío de correo no está configurado");
    }

    const enlace = `${configSmtp.urlBase}/revisor`;

    // Si el buzón compartido está configurado, un solo correo a esa dirección. Si no, un correo
    // INDIVIDUAL por cada revisor activo (nunca todos en el mismo To/CC: expondría el email de un
    // revisor a otro).
    if (env.BUZON_COMPARTIDO_REVISOR_EMAIL) {
      await enviarACorreo(env.BUZON_COMPARTIDO_REVISOR_EMAIL, "Hola Equipo Revisor,", enlace, datos);
      return;
    }

    const revisores = await prismaUsuarioRepository.listarActivosPorPerfil(CODIGO_PERFIL_REVISOR_REPOSITORIO);

    for (const revisor of revisores) {
      const nombre = primerNombre(revisor.nombres);
      const saludo = nombre.length > 0 ? `Hola ${nombre},` : "Hola,";
      await enviarACorreo(revisor.email, saludo, enlace, datos);
    }
  },
};
