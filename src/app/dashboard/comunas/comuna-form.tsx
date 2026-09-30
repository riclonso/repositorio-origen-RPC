"use client";

import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { comunaSchema } from "@/modules/comunas/schemas/comuna.schema";
import { Boton } from "@/shared/components/Boton";
import {
  CampoSelect,
  type GrupoOpcionesSelect,
  type OpcionSelect,
} from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_COMUNAS } from "./ruta-comunas";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar la comuna. Intenta nuevamente.";

// Sin provincia preseleccionada en el alta: el esquema rechaza el valor vacío, así que el operador
// está obligado a elegir.
const OPCION_SIN_ELEGIR: OpcionSelect = { valor: "", etiqueta: "Selecciona una provincia" };

type EstadoComunaForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoComunaForm = { errores: {}, errorGeneral: null };

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

type ErrorApi = { mensaje: string; campo: string | null };

// La respuesta de error de la API ({ error, campo?, codigo? }) se trata como `unknown` y se
// estrecha campo a campo: un cuerpo inesperado (HTML de un proxy, JSON distinto) cae al mensaje
// genérico en vez de romper el formulario.
function leerErrorApi(cuerpo: unknown): ErrorApi {
  if (typeof cuerpo !== "object" || cuerpo === null) {
    return { mensaje: MENSAJE_ERROR_GENERICO, campo: null };
  }

  const mensaje = "error" in cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : null;
  const campo = "campo" in cuerpo && typeof cuerpo.campo === "string" ? cuerpo.campo : null;

  return { mensaje: mensaje ?? MENSAJE_ERROR_GENERICO, campo };
}

export type ValoresInicialesComuna = {
  nombre: string;
  codigo: string;
  provinciaId: string;
};

type ComunaFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  valoresIniciales: ValoresInicialesComuna;
  // Provincias agrupadas por región (`<optgroup>` "08 · Biobío").
  gruposProvincia: GrupoOpcionesSelect[];
};

// Campos NO controlados (`defaultValue`, incluido el select): el envío va por `onSubmit` +
// `startTransition` y no por `<form action>`, así que React no engancha el `.reset()` nativo y lo
// ingresado se conserva tras un error (ver docs/arquitectura.md).
//
// El prefijo del código (los 3 primeros dígitos = código de la provincia) NO se valida aquí: es
// una regla de negocio del servidor, que responde 400 marcando el campo `codigo`.
export function ComunaForm({
  modo,
  endpoint,
  metodo,
  valoresIniciales,
  gruposProvincia,
}: ComunaFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  const [estado, enviarFormulario, enviando] = useActionState<EstadoComunaForm, FormData>(
    async (_estadoPrevio, formData) => {
      const bruto = {
        nombre: String(formData.get("nombre") ?? ""),
        codigo: String(formData.get("codigo") ?? ""),
        provinciaId: String(formData.get("provinciaId") ?? ""),
      };
      const analisis = comunaSchema.safeParse(bruto);

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
          const cuerpo: unknown = await respuesta.json().catch(() => null);
          const { mensaje, campo } = leerErrorApi(cuerpo);

          if (campo) {
            return { errores: { [campo]: mensaje }, errorGeneral: null };
          }

          return { errores: {}, errorGeneral: mensaje };
        }
      } catch {
        return { errores: {}, errorGeneral: MENSAJE_ERROR_GENERICO };
      }

      router.push(esCreacion ? `${RUTA_COMUNAS}?creado=1` : RUTA_COMUNAS);
      router.refresh();
      return ESTADO_INICIAL;
    },
    ESTADO_INICIAL,
  );

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const formData = new FormData(evento.currentTarget);

        startTransition(() => {
          enviarFormulario(formData);
        });
      }}
      className="mt-6 flex flex-col gap-5"
    >
      <CampoSelect
        id="provinciaId"
        name="provinciaId"
        etiqueta="Provincia"
        opciones={[OPCION_SIN_ELEGIR, ...gruposProvincia]}
        defaultValue={valoresIniciales.provinciaId}
        error={estado.errores.provinciaId}
      />

      <CampoTexto
        id="codigo"
        name="codigo"
        etiqueta="Código"
        ayuda="5 dígitos; los 3 primeros son el código de la provincia, p. ej. 08101."
        inputMode="numeric"
        autoComplete="off"
        defaultValue={valoresIniciales.codigo}
        error={estado.errores.codigo}
        maxLength={5}
      />

      <CampoTexto
        id="nombre"
        name="nombre"
        etiqueta="Nombre"
        ayuda="Por ejemplo: Talcahuano."
        autoComplete="off"
        defaultValue={valoresIniciales.nombre}
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
          {esCreacion ? "Crear comuna" : "Guardar cambios"}
        </Boton>

        <Link
          href={RUTA_COMUNAS}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
