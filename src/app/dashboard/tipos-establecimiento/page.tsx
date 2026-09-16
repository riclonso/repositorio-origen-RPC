import type { Metadata } from "next";
import Link from "next/link";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import type { TipoEstablecimiento } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import { RUTA_TIPOS } from "./ruta-tipos";
import { TablaTipos, type FilaTipoVista } from "./tabla-tipos";

export const metadata: Metadata = {
  title: "Tipos de establecimiento - Repositorio RPC - SEREMI de Salud Biobío",
};

type TiposPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// La fecha se formatea en el servidor y con zona horaria fija: si la formateara el navegador, la
// hidratación mostraría un valor distinto según la zona del equipo del funcionario.
const formateadorFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CLASES_ENLACE_NUEVO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

function aFilaVista(tipo: TipoEstablecimiento): FilaTipoVista {
  return {
    id: tipo.id,
    nombre: tipo.nombre,
    activo: tipo.activo,
    creadoEl: formateadorFecha.format(tipo.createdAt),
  };
}

export default async function TiposEstablecimientoPage({ searchParams }: TiposPageProps) {
  const parametros = await searchParams;
  const tipoCreado = parametros.creado === "1";

  const tipos = await listarTiposEstablecimiento(
    {},
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  const conteo = tipos.length === 1 ? "1 tipo registrado" : `${tipos.length} tipos registrados`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Tipos de establecimiento</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Catálogo de tipos que se ofrecen al registrar un establecimiento.
          </p>
        </div>

        <Link href={`${RUTA_TIPOS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
          Nuevo tipo
        </Link>
      </div>

      {tipoCreado ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Tipo creado.
        </p>
      ) : null}

      {tipos.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
            {conteo}
          </p>
          <TablaTipos
            filas={tipos.map(aFilaVista)}
            descripcion="Tipos de establecimiento registrados, activos e inactivos."
          />
        </>
      ) : (
        <div className="card-sistema mt-6 p-8 text-center">
          <p className="text-base font-semibold text-gob-black">
            Aún no hay tipos registrados
          </p>
          <p className="mt-2 text-sm text-gob-gray-a">
            Crea el primer tipo para poder registrar establecimientos.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href={`${RUTA_TIPOS}/nuevo`} className={CLASES_ENLACE_NUEVO}>
              Crear tipo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
