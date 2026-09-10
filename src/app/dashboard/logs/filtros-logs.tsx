"use client";

import { useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { TipoLog } from "@/infrastructure/logging/leerLogs";
import { Boton } from "@/shared/components/Boton";
import { construirRutaLogs } from "./ruta-logs";

type FiltrosLogsProps = {
  tipo: TipoLog;
  desdeInicial: string;
  hastaInicial: string;
};

const CLASES_CAMPO_FECHA =
  "rounded-md border border-gob-accent bg-white px-3 py-2 text-sm text-gob-black outline-none transition-colors focus-visible:border-gob-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gob-primary";

// El filtro vive en la URL (compartible y sobrevive al refresh), igual que el del mantenedor.
// Campos no controlados: el componente se remonta con la `key` del filtro vigente.
export function FiltrosLogs({ tipo, desdeInicial, hastaInicial }: FiltrosLogsProps) {
  const router = useRouter();
  const [filtrando, iniciarFiltro] = useTransition();

  function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const desde = String(datos.get("desde") ?? "");
    const hasta = String(datos.get("hasta") ?? "");

    iniciarFiltro(() =>
      router.push(
        construirRutaLogs({
          tipo,
          desde: desde === "" ? undefined : desde,
          hasta: hasta === "" ? undefined : hasta,
        }),
      ),
    );
  }

  function limpiar() {
    iniciarFiltro(() => router.push(construirRutaLogs({ tipo })));
  }

  const hayFiltro = desdeInicial !== "" || hastaInicial !== "";

  return (
    <form
      onSubmit={manejarEnvio}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gob-accent bg-white p-4"
    >
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
          className={CLASES_CAMPO_FECHA}
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
          className={CLASES_CAMPO_FECHA}
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
