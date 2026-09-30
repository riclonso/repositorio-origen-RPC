"use client";

import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { provinciaSchema } from "@/modules/provincias/schemas/provincia.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoSelect, type OpcionSelect } from "@/shared/components/CampoSelect";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_PROVINCIAS } from "./ruta-provincias";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar la provincia. Intenta nuevamente.";

// Sin región preseleccionada en el alta: el esquema rechaza el valor vacío, así que el operador
// está obligado a elegir.
const OPCION_SIN_ELEGIR: OpcionSelect = { valor: "", etiqueta: "Selecciona una región" };

type EstadoProvinciaForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoProvinciaForm = { errores: {}, errorGeneral: null };

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

export type ValoresInicialesProvincia = {
  nombre: string;
  codigo: string;
  regionId: string;
};

type ProvinciaFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  valoresIniciales: ValoresInicialesProvincia;
  opcionesRegion: OpcionSelect[];
};

// Campos NO controlados (`defaultValue`, incluido el select): el envío va por `onSubmit` +
// `startTransition` y no por `<form action>`, así que React no engancha el `.reset()` nativo y lo
// ingresado se conserva tras un error (ver docs/arquitectura.md).
//
// El prefijo del código (los 2 primeros dígitos = código de la región) NO se valida aquí: es una
// regla de negocio del servidor, que responde 400 marcando el campo `codigo`.
export function ProvinciaForm({
  modo,
  endpoint,
  metodo,
  valoresIniciales,
  opcionesRegion,
}: ProvinciaFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  const [estado, enviarFormulario, enviando] = useActionState<EstadoProvinciaForm, FormData>(
    async (_estadoPrevio, formData) => {
      const bruto = {
        nombre: String(formData.get("nombre") ?? ""),
        codigo: String(formData.get("codigo") ?? ""),
        regionId: String(formData.get("regionId") ?? ""),
      };
      const analisis = provinciaSchema.safeParse(bruto);

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

      router.push(esCreacion ? `${RUTA_PROVINCIAS}?creado=1` : RUTA_PROVINCIAS);
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
        id="regionId"
        name="regionId"
        etiqueta="Región"
        opciones={[OPCION_SIN_ELEGIR, ...opcionesRegion]}
        defaultValue={valoresIniciales.regionId}
        error={estado.errores.regionId}
      />

      <CampoTexto
        id="codigo"
        name="codigo"
        etiqueta="Código"
        ayuda="3 dígitos; los 2 primeros son el código de la región, p. ej. 081."
        inputMode="numeric"
        autoComplete="off"
        defaultValue={valoresIniciales.codigo}
        error={estado.errores.codigo}
        maxLength={3}
      />

      <CampoTexto
        id="nombre"
        name="nombre"
        etiqueta="Nombre"
        ayuda="Por ejemplo: Concepción."
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
          {esCreacion ? "Crear provincia" : "Guardar cambios"}
        </Boton>

        <Link
          href={RUTA_PROVINCIAS}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
