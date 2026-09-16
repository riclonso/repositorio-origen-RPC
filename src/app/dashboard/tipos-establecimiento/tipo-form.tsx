"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { tipoEstablecimientoFormSchema } from "@/modules/tipoEstablecimiento/schemas/tipoEstablecimiento.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_TIPOS } from "./ruta-tipos";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar el tipo. Intenta nuevamente.";

type EstadoTipoForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoTipoForm = { errores: {}, errorGeneral: null };

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

type TipoFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  nombreInicial: string;
};

export function TipoForm({ modo, endpoint, metodo, nombreInicial }: TipoFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  // Campo controlado: un error de validación no debe borrar lo que el operador ya escribió.
  const [nombre, setNombre] = useState(nombreInicial);

  const [estado, enviarFormulario, enviando] = useActionState<EstadoTipoForm, FormData>(
    async (_estadoPrevio, formData) => {
      const bruto = { nombre: String(formData.get("nombre") ?? "") };
      const analisis = tipoEstablecimientoFormSchema.safeParse(bruto);

      if (!analisis.success) {
        return { errores: aErroresPorCampo(analisis.error), errorGeneral: null };
      }

      try {
        const respuesta = await fetch(endpoint, {
          method: metodo,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(analisis.data),
        });

        if (!respuesta.ok) {
          const datos = await respuesta.json().catch(() => null);
          const mensaje: string = datos?.error ?? MENSAJE_ERROR_GENERICO;

          if (datos?.campo) {
            return { errores: { [String(datos.campo)]: mensaje }, errorGeneral: null };
          }

          return { errores: {}, errorGeneral: mensaje };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
      }

      router.push(esCreacion ? `${RUTA_TIPOS}?creado=1` : RUTA_TIPOS);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form action={enviarFormulario} className="mt-6 flex flex-col gap-5">
      <CampoTexto
        id="nombre"
        name="nombre"
        etiqueta="Nombre"
        ayuda="Por ejemplo: Hospital, Consultorio, Laboratorio."
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={estado.errores.nombre}
        maxLength={120}
      />

      {estado.errorGeneral ? (
        <p role="alert" className="text-sm font-medium text-gob-danger">
          {estado.errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Boton type="submit" variante="primario" cargando={enviando} textoCargando="Guardando...">
          {esCreacion ? "Crear tipo" : "Guardar cambios"}
        </Boton>

        <Link
          href={RUTA_TIPOS}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
