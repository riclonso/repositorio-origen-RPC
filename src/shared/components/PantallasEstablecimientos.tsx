import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { listarTiposEstablecimiento } from "@/modules/tipoEstablecimiento/application/use-cases/ListarTiposEstablecimiento";
import { prismaTipoEstablecimientoRepository } from "@/modules/tipoEstablecimiento/infrastructure/repositories/PrismaTipoEstablecimientoRepository";
import { obtenerEstablecimiento } from "@/modules/establecimiento/application/use-cases/ObtenerEstablecimiento";
import { prismaEstablecimientoRepository } from "@/modules/establecimiento/infrastructure/repositories/PrismaEstablecimientoRepository";
import type { FiltroListadoEstablecimientos } from "@/modules/establecimiento/domain/entities/Establecimiento";
import {
  FILTRO_LISTADO_POR_DEFECTO,
  listadoEstablecimientosSchema,
} from "@/modules/establecimiento/schemas/listado-establecimientos.schema";
import type { OpcionSelect } from "@/shared/components/CampoSelect";
import { EsqueletoTablaEstablecimientos } from "@/shared/components/EsqueletoTablaEstablecimientos";
import { aOpcionesTipo } from "@/shared/components/opciones-tipo-establecimiento";
import { FiltrosEstablecimientos } from "@/shared/components/FiltrosEstablecimientos";
import { ListadoEstablecimientos } from "@/shared/components/ListadoEstablecimientos";
import { EstablecimientoForm } from "@/shared/components/FormularioEstablecimiento";
import { construirRutaEstablecimientos } from "@/shared/components/ruta-establecimientos";

// Pantallas del mantenedor de establecimientos, compartidas entre `/dashboard/establecimientos`
// (ADMIN) y `/revisor/establecimientos` (REVISOR_REPOSITORIO): mismo acceso completo en ambos
// paneles. Cada `page.tsx` es un envoltorio delgado que aporta su `rutaBase` y su `metadata`; los
// endpoints de `/api/establecimientos/**` usan `exigirAdminORevisor()`.

const idSchema = z.uuid();

type PantallaListadoEstablecimientosProps = {
  parametros: Record<string, string | string[] | undefined>;
  rutaBase: string;
};

export async function PantallaListadoEstablecimientos({
  parametros,
  rutaBase,
}: PantallaListadoEstablecimientosProps) {
  const establecimientoCreado = parametros.creado === "1";

  // Modo tolerante: una URL editada a mano por el operador cae a los valores por defecto en vez de
  // romper la pantalla. El Route Handler, en cambio, responde 400.
  const analisis = listadoEstablecimientosSchema.safeParse(parametros);
  const filtro: FiltroListadoEstablecimientos = analisis.success
    ? analisis.data
    : { ...FILTRO_LISTADO_POR_DEFECTO };

  // Se ofrecen TODOS los tipos, incluidos los dados de baja: un tipo desactivado que aún tiene
  // establecimientos debe poder filtrarse, si no esos registros quedan sin forma de encontrarse.
  const tipos = await listarTiposEstablecimiento(
    {},
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  const claveFiltro = construirRutaEstablecimientos(rutaBase, filtro);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Establecimientos</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Administra los establecimientos que reportan al Registro Poblacional de Cáncer.
          </p>
        </div>

        <Link
          href={`${rutaBase}/nuevo`}
          className="inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Nuevo establecimiento
        </Link>
      </div>

      <FiltrosEstablecimientos
        key={`filtros:${claveFiltro}`}
        terminoInicial={filtro.termino ?? ""}
        tipoInicial={filtro.tipo ?? ""}
        activoInicial={filtro.activo === undefined ? "" : String(filtro.activo)}
        tamano={filtro.tamano}
        opcionesTipo={aOpcionesTipo(tipos)}
        rutaBase={rutaBase}
      />

      {establecimientoCreado ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          Establecimiento creado.
        </p>
      ) : null}

      {/* La key hace reaparecer el esqueleto en cada búsqueda y en cada salto de página;
          loading.tsx solo cubre la primera entrada al segmento. */}
      <Suspense key={`listado:${claveFiltro}`} fallback={<EsqueletoTablaEstablecimientos />}>
        <ListadoEstablecimientos filtro={filtro} rutaBase={rutaBase} />
      </Suspense>
    </div>
  );
}

// Sin tipo preseleccionado: el esquema rechaza el valor vacío, así que el operador está obligado a
// elegir.
const OPCION_SIN_ELEGIR: OpcionSelect = { valor: "", etiqueta: "Selecciona un tipo" };

export async function PantallaNuevoEstablecimiento({ rutaBase }: { rutaBase: string }) {
  // Esta pantalla no lee cookies ni parámetros, así que Next la prerenderizaría en el build y
  // dejaría el catálogo congelado en esa foto (y obligaría a la base a estar disponible al
  // compilar). `connection()` la ancla al momento de la petición.
  await connection();

  // Solo tipos vigentes: dar de alta con un tipo dado de baja no tiene sentido.
  const tipos = await listarTiposEstablecimiento(
    { soloActivos: true },
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Nuevo establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Registra un establecimiento que reporta al Registro Poblacional de Cáncer.
      </p>

      <EstablecimientoForm
        modo="crear"
        endpoint="/api/establecimientos"
        metodo="POST"
        valoresIniciales={{ rut: "", nombre: "", direccion: "", tipoId: "" }}
        opcionesTipo={[OPCION_SIN_ELEGIR, ...aOpcionesTipo(tipos)]}
        rutaBase={rutaBase}
      />
    </div>
  );
}

type PantallaEditarEstablecimientoProps = {
  id: string;
  rutaBase: string;
};

export async function PantallaEditarEstablecimiento({ id, rutaBase }: PantallaEditarEstablecimientoProps) {
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const establecimiento = await obtenerEstablecimiento(idValido.data, {
    repositorio: prismaEstablecimientoRepository,
  });

  if (!establecimiento) {
    notFound();
  }

  // El tipo vigente del establecimiento se incluye aunque esté dado de baja. Sin esto, editar un
  // establecimiento cuyo tipo fue desactivado mostraría un select sin su valor actual: el navegador
  // elegiría otra opción y guardar le cambiaría el tipo en silencio.
  const tipos = await listarTiposEstablecimiento(
    { soloActivos: true, incluirIds: [establecimiento.tipoId] },
    { repositorio: prismaTipoEstablecimientoRepository },
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar establecimiento</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza los datos del establecimiento.
      </p>

      <EstablecimientoForm
        modo="editar"
        endpoint={`/api/establecimientos/${establecimiento.id}`}
        metodo="PUT"
        valoresIniciales={{
          rut: establecimiento.rut,
          nombre: establecimiento.nombre,
          direccion: establecimiento.direccion,
          tipoId: establecimiento.tipoId,
        }}
        opcionesTipo={aOpcionesTipo(tipos)}
        rutaBase={rutaBase}
      />
    </div>
  );
}
