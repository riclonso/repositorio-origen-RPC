"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ETIQUETA_TIPO_AVISO,
  TIPOS_AVISO_CORREO,
  esTipoAvisoCorreo,
  type TipoAvisoCorreo,
} from "@/infrastructure/logging/catalogoFallasCorreo";
import type { TipoLog } from "@/infrastructure/logging/leerLogs";
import { Boton } from "@/shared/components/Boton";
import { construirRutaLogs } from "./ruta-logs";

type FiltrosLogsProps = {
  tipo: TipoLog;
  desdeInicial: string;
  hastaInicial: string;
  // RF-44: solo se usa (y el select solo se muestra) en la pestaña de fallas de correo.
  tipoAvisoInicial?: TipoAvisoCorreo;
};

const CLASES_CAMPO =
  "rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none transition-colors focus-visible:border-gob-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gob-primary";

// Las etiquetas del catálogo son estáticas: se arman una vez al cargar el módulo.
const OPCIONES_TIPO_AVISO = TIPOS_AVISO_CORREO.map((tipoAviso) => ({
  valor: tipoAviso,
  etiqueta: ETIQUETA_TIPO_AVISO[tipoAviso],
}));

function valorFormulario(datos: FormData, campo: string): string | undefined {
  const valor = String(datos.get(campo) ?? "");
  return valor === "" ? undefined : valor;
}

// El filtro vive en la URL (compartible y sobrevive al refresh), igual que el del mantenedor.
// Campos no controlados: el componente se remonta con la `key` del filtro vigente.
export function FiltrosLogs({ tipo, desdeInicial, hastaInicial, tipoAvisoInicial }: FiltrosLogsProps) {
  const router = useRouter();
  const [filtrando, iniciarFiltro] = useTransition();
  const filtraPorTipoAviso = tipo === "fallas-correo";

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const tipoAviso = valorFormulario(datos, "aviso");

    iniciarFiltro(() =>
      router.push(
        construirRutaLogs({
          tipo,
          desde: valorFormulario(datos, "desde"),
          hasta: valorFormulario(datos, "hasta"),
          tipoAviso: esTipoAvisoCorreo(tipoAviso) ? tipoAviso : undefined,
        }),
      ),
    );
  }

  function limpiar() {
    iniciarFiltro(() => router.push(construirRutaLogs({ tipo })));
  }

  const hayFiltro = desdeInicial !== "" || hastaInicial !== "" || tipoAvisoInicial !== undefined;

  return (
    <form
      onSubmit={manejarEnvio}
      className="mt-4 flex flex-wrap items-end gap-3 border-t border-[#e3ebf2] pt-4"
    >
      <div className="mr-auto basis-full sm:basis-auto">
        <p className="text-sm font-semibold text-gob-tertiary">
          {filtraPorTipoAviso ? "Filtrar por período y tipo de aviso" : "Filtrar por período"}
        </p>
        <p className="mt-0.5 text-xs text-gob-gray-a">El rango se aplica a los registros mostrados.</p>
      </div>

      {filtraPorTipoAviso ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="aviso" className="text-sm font-medium text-gob-black">
            Tipo de aviso
          </label>
          <select id="aviso" name="aviso" defaultValue={tipoAvisoInicial ?? ""} className={`${CLASES_CAMPO} min-w-56`}>
            <option value="">Todos</option>
            {OPCIONES_TIPO_AVISO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="desde" className="text-sm font-medium text-gob-black">
          Desde
        </label>
        {/* `max={hasta}`/`min={desde}` no se fijan cruzados a propósito: el servidor tolera un
            rango invertido devolviendo cero resultados, y bloquearlo en el cliente confundiría
            al editar. */}
        <input
          type="date"
          id="desde"
          name="desde"
          defaultValue={desdeInicial}
          className={`${CLASES_CAMPO} min-w-40`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hasta" className="text-sm font-medium text-gob-black">
          Hasta
        </label>
        <input
          type="date"
          id="hasta"
          name="hasta"
          defaultValue={hastaInicial}
          className={`${CLASES_CAMPO} min-w-40`}
        />
      </div>

      <Boton type="submit" variante="primario" cargando={filtrando} textoCargando="Filtrando...">
        Filtrar
      </Boton>

      {hayFiltro ? (
        <Boton type="button" variante="secundario" onClick={limpiar}>
          Limpiar
        </Boton>
      ) : null}
    </form>
  );
}
