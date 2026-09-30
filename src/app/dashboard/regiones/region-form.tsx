"use client";

import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ZodError } from "zod";
import { aNumeroRegion, regionSchema } from "@/modules/regiones/schemas/region.schema";
import { Boton } from "@/shared/components/Boton";
import { CampoTexto } from "@/shared/components/CampoTexto";
import { RUTA_REGIONES } from "./ruta-regiones";

const MENSAJE_ERROR_GENERICO = "No se pudo guardar la región. Intenta nuevamente.";

type EstadoRegionForm = {
  errores: Record<string, string>;
  errorGeneral: string | null;
};

const ESTADO_INICIAL: EstadoRegionForm = { errores: {}, errorGeneral: null };

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

export type ValoresInicialesRegion = {
  nombre: string;
  codigo: string;
  // Texto: el campo es un input, y en alta arranca vacío.
  numero: string;
};

type RegionFormProps = {
  modo: "crear" | "editar";
  endpoint: string;
  metodo: "POST" | "PUT";
  valoresIniciales: ValoresInicialesRegion;
};

// Campos NO controlados (`defaultValue`): el envío va por `onSubmit` + `startTransition` y no por
// `<form action>`, así que React no engancha el `.reset()` nativo y lo tecleado se conserva tras
// un error (ver docs/arquitectura.md). Evita además copiar props a estado local.
export function RegionForm({ modo, endpoint, metodo, valoresIniciales }: RegionFormProps) {
  const router = useRouter();
  const esCreacion = modo === "crear";

  const [estado, enviarFormulario, enviando] = useActionState<EstadoRegionForm, FormData>(
    async (_estadoPrevio, formData) => {
      const bruto = {
        nombre: String(formData.get("nombre") ?? ""),
        codigo: String(formData.get("codigo") ?? ""),
        numero: aNumeroRegion(String(formData.get("numero") ?? "")),
      };
      const analisis = regionSchema.safeParse(bruto);

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

      router.push(esCreacion ? `${RUTA_REGIONES}?creado=1` : RUTA_REGIONES);
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
      <CampoTexto
        id="numero"
        name="numero"
        etiqueta="Número"
        ayuda="Número de la región, entre 1 y 99."
        inputMode="numeric"
        autoComplete="off"
        defaultValue={valoresIniciales.numero}
        error={estado.errores.numero}
        maxLength={2}
      />

      <CampoTexto
        id="codigo"
        name="codigo"
        etiqueta="Código"
        ayuda="2 dígitos con cero a la izquierda, p. ej. 08."
        inputMode="numeric"
        autoComplete="off"
        defaultValue={valoresIniciales.codigo}
        error={estado.errores.codigo}
        maxLength={2}
      />

      <CampoTexto
        id="nombre"
        name="nombre"
        etiqueta="Nombre"
        ayuda="Por ejemplo: Biobío."
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
          {esCreacion ? "Crear región" : "Guardar cambios"}
        </Boton>

        <Link
          href={RUTA_REGIONES}
          className="inline-flex items-center justify-center rounded-md border border-gob-accent bg-white px-4 py-2 text-sm font-medium text-gob-gray-a transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
