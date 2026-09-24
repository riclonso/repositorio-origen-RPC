"use client";

import { useActionState, useState } from "react";
import type { ZodError } from "zod";
import { cambiarContrasenaPropiaFormSchema } from "@/modules/usuarios/schemas/cambiar-contrasena-propia.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoContrasena } from "@/shared/components/CampoContrasena";
import { RequisitosContrasena } from "@/shared/components/RequisitosContrasena";
import { CoincidenciaContrasena } from "@/shared/components/CoincidenciaContrasena";

const MENSAJE_ERROR_GENERICO = "No se pudo cambiar la contraseña. Intenta nuevamente.";

type EstadoCambiarContrasenaForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoCambiarContrasenaForm = { errores: {}, errorGeneral: null };

function aErroresPorCampo(error: ZodError): Record<string, string> {
  const errores: Record<string, string> = {};

  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? "general");
    if (!errores[campo]) {
      errores[campo] = problema.message;
    }
  }

  return errores;
}

// Autoservicio de cambio de contraseña ("Mi perfil" → "Cambiar contraseña"), compartido por los
// tres paneles (ADMIN, NOTIFICADOR_RPC, REVISOR_REPOSITORIO). A diferencia de `ContrasenaForm`
// (un administrador fija la contraseña de un tercero, sin conocerla), aquí la propia persona debe
// probar que conoce la contraseña vigente.
export function CambiarContrasenaPropiaForm() {
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [contrasenaNueva, setContrasenaNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const [estado, enviarFormulario, enviando] = useActionState<EstadoCambiarContrasenaForm, FormData>(
    async (_estadoPrevio, formData) => {
      const analisis = cambiarContrasenaPropiaFormSchema.safeParse({
        contrasenaActual: String(formData.get("contrasenaActual") ?? ""),
        contrasenaNueva: String(formData.get("contrasenaNueva") ?? ""),
        confirmacionContrasena: String(formData.get("confirmacionContrasena") ?? ""),
      });

      if (!analisis.success) {
        return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
      }

      try {
        const respuesta = await fetch("/api/cuenta/contrasena", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contrasenaActual: analisis.data.contrasenaActual,
            contrasenaNueva: analisis.data.contrasenaNueva,
          }),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          return { errores: {}, errorGeneral: datos?.error ?? MENSAJE_ERROR_GENERICO };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
      }

      // Navegación dura a propósito, no `router.push`: cambiar la contraseña invalida la sesión
      // vigente (la cookie ya se borró en el servidor), y una navegación suave del App Router
      // puede reutilizar una entrada previa de la caché de rutas del cliente en vez de pedir
      // `/login` de cero. Mismo patrón exacto que `app/login/login-form.tsx` tras iniciar sesión.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- ver nota arriba
      window.location.assign("/login?motivo=contrasena-actualizada");
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-4 flex flex-col gap-5">
      <div className="max-w-sm">
        <CampoContrasena
          id="contrasenaActual"
          name="contrasenaActual"
          etiqueta="Contraseña actual"
          autoComplete="current-password"
          error={estado.errores.contrasenaActual}
          value={contrasenaActual}
          onChange={(evento) => setContrasenaActual(evento.target.value)}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <CampoContrasena
            id="contrasenaNueva"
            name="contrasenaNueva"
            etiqueta="Nueva contraseña"
            autoComplete="new-password"
            error={estado.errores.contrasenaNueva}
            aria-describedby="requisitos-contrasena-propia"
            value={contrasenaNueva}
            onChange={(evento) => setContrasenaNueva(evento.target.value)}
          />
          <RequisitosContrasena id="requisitos-contrasena-propia" contrasena={contrasenaNueva} />
        </div>

        <div>
          <CampoContrasena
            id="confirmacionContrasena"
            name="confirmacionContrasena"
            etiqueta="Repetir nueva contraseña"
            autoComplete="new-password"
            error={estado.errores.confirmacionContrasena}
            aria-describedby="coincidencia-contrasena-propia"
            value={confirmacion}
            onChange={(evento) => setConfirmacion(evento.target.value)}
          />
          <CoincidenciaContrasena
            id="coincidencia-contrasena-propia"
            contrasena={contrasenaNueva}
            confirmacion={confirmacion}
          />
        </div>
      </div>

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <div>
        <Boton type="submit" variante="primario" cargando={enviando} textoCargando="Guardando...">
          Cambiar contraseña
        </Boton>
      </div>
    </form>
  );
}
