import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { listarTiposEstablecimientoConUso } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimientoConUso";
import { obtenerTipoEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ObtenerTipoEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import type { TipoEstablecimientoListado } from "@/modules/tipoEstablecimiento/domain/entities/TipoEstablecimiento";
import { TablaTipos, type FilaTipoVista } from "@/shared/components/TablaTiposEstablecimiento";
import { TipoForm } from "@/shared/components/FormularioTipoEstablecimiento";

// Pantallas del mantenedor de tipos de establecimiento, compartidas entre
// `/dashboard/tipos-establecimiento` (ADMIN) y `/revisor/tipos-establecimiento`
// (REVISOR_REPOSITORIO). Mismo criterio que `PantallasEstablecimientos.tsx`.

const idSchema = z.uuid();

// La fecha se formatea en el servidor y con zona horaria fija: si la formateara el navegador, la
// hidratación mostraría un valor distinto según la zona del equipo del funcionario.
const formateadorFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CLASES_ENLACE_NUEVO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

function aFilaVista(tipo: TipoEstablecimientoListado): FilaTipoVista {
  return {
    id: tipo.id,
    nombre: tipo.nombre,
    activo: tipo.activo,
    creadoEl: formateadorFecha.format(tipo.createdAt),
    cantidadEstablecimientos: tipo.cantidadEstablecimientos,
  };
}

type PantallaListadoTiposProps = {
  parametros: Record<string, string | string[] | undefined>;
  rutaBase: string;
};

export async function PantallaListadoTiposEstablecimiento({
  parametros,
  rutaBase,
}: PantallaListadoTiposProps) {
  const tipoCreado = parametros.creado === "1";

  const tipos = await listarTiposEstablecimientoConUso({
    repositorio: prismaTipoEstablecimientoRepository,
  });

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

        <Link href={`${rutaBase}/nuevo`} className={CLASES_ENLACE_NUEVO}>
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
            rutaBase={rutaBase}
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
            <Link href={`${rutaBase}/nuevo`} className={CLASES_ENLACE_NUEVO}>
              Crear tipo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function PantallaNuevoTipoEstablecimiento({ rutaBase }: { rutaBase: string }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo tipo de establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        El nombre se ofrecerá al registrar establecimientos.
      </p>

      <TipoForm
        modo="crear"
        endpoint="/api/tipos-establecimiento"
        metodo="POST"
        nombreInicial=""
        rutaBase={rutaBase}
      />
    </div>
  );
}

type PantallaEditarTipoProps = {
  id: string;
  rutaBase: string;
};

export async function PantallaEditarTipoEstablecimiento({ id, rutaBase }: PantallaEditarTipoProps) {
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const tipo = await obtenerTipoEstablecimiento(idValido.data, {
    repositorio: prismaTipoEstablecimientoRepository,
  });

  if (!tipo) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar tipo de establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza el nombre del tipo. El cambio se refleja en los establecimientos que lo usan.
      </p>

      <TipoForm
        modo="editar"
        endpoint={`/api/tipos-establecimiento/${tipo.id}`}
        metodo="PUT"
        nombreInicial={tipo.nombre}
        rutaBase={rutaBase}
      />
    </div>
  );
}
