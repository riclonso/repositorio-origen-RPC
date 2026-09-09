import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import type { FiltroListadoUsuarios } from "@/modules/usuarios/domain/entities/Usuario";
import {
  FILTRO_LISTADO_POR_DEFECTO,
  listadoUsuariosSchema,
} from "@/modules/usuarios/schemas/listado-usuarios.schema";
import { EsqueletoTablaUsuarios } from "./esqueleto-tabla-usuarios";
import { FiltrosUsuarios } from "./filtros-usuarios";
import { ListadoUsuarios } from "./listado-usuarios";
import { RUTA_USUARIOS, construirRutaUsuarios } from "./ruta-usuarios";

export const metadata: Metadata = {
  title: "Usuarios - Intranet SEREMI de Salud Biobío",
};

type UsuariosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsuariosPage({ searchParams }: UsuariosPageProps) {
  const parametros = await searchParams;

  // Modo tolerante: una URL editada a mano por el operador cae a los valores por defecto
  // en vez de romper la pantalla. El Route Handler, en cambio, responde 400.
  const analisis = listadoUsuariosSchema.safeParse(parametros);
  const filtro: FiltroListadoUsuarios = analisis.success
    ? analisis.data
    : { ...FILTRO_LISTADO_POR_DEFECTO };

  const sesion = await obtenerSesionActual();
  const actorId = sesion?.sub ?? "";
  const claveFiltro = construirRutaUsuarios(filtro);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gob-black">Usuarios</h1>
          <p className="mt-2 text-sm text-gob-gray-a">
            Administra las cuentas que pueden ingresar al sistema.
          </p>
        </div>

        <Link
          href={`${RUTA_USUARIOS}/nuevo`}
          className="inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Nuevo usuario
        </Link>
      </div>

      <FiltrosUsuarios
        key={`filtros:${claveFiltro}`}
        terminoInicial={filtro.termino ?? ""}
        rolInicial={filtro.rol ?? ""}
        activoInicial={filtro.activo === undefined ? "" : String(filtro.activo)}
        tamano={filtro.tamano}
      />

      {/* La key hace reaparecer el esqueleto en cada búsqueda y en cada salto de página;
          loading.tsx solo cubre la primera entrada al segmento. */}
      <Suspense key={`listado:${claveFiltro}`} fallback={<EsqueletoTablaUsuarios />}>
        <ListadoUsuarios filtro={filtro} actorId={actorId} />
      </Suspense>
    </div>
  );
}
