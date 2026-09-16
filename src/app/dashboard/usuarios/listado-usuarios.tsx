import Link from "next/link";
import type { FiltroListadoUsuarios, Usuario } from "@/modules/usuarios/domain/entities/Usuario";
import { listarUsuarios } from "@/modules/usuarios/application/use-cases/ListarUsuarios";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { RUTA_USUARIOS, construirRutaUsuarios } from "./ruta-usuarios";
import { PaginacionUsuarios } from "./paginacion-usuarios";
import { TablaUsuarios, type FilaUsuarioVista } from "./tabla-usuarios";

// La fecha se formatea en el servidor y con zona horaria fija: si la formateara el navegador,
// la hidratación mostraría un valor distinto según la zona del equipo del funcionario.
const formateadorFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const CLASES_ENLACE_VACIO =
  "inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";

function aFilaVista(usuario: Usuario): FilaUsuarioVista {
  return {
    id: usuario.id,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    rut: usuario.rut,
    email: usuario.email,
    username: usuario.username,
    perfilNombre: usuario.perfilNombre,
    activo: usuario.activo,
    tieneContrasena: usuario.tieneContrasena,
    creadoEl: formateadorFecha.format(usuario.createdAt),
  };
}

function EstadoVacio({ titulo, detalle, accion }: { titulo: string; detalle: string; accion: React.ReactNode }) {
  return (
    <div className="card-sistema mt-6 p-8 text-center">
      <p className="text-base font-semibold text-gob-black">{titulo}</p>
      <p className="mt-2 text-sm text-gob-gray-a">{detalle}</p>
      <div className="mt-4 flex justify-center">{accion}</div>
    </div>
  );
}

type ListadoUsuariosProps = {
  filtro: FiltroListadoUsuarios;
  actorId: string;
};

export async function ListadoUsuarios({ filtro, actorId }: ListadoUsuariosProps) {
  const resultado = await listarUsuarios(filtro, { repositorio: prismaUsuarioRepository });
  const { filas, paginacion } = resultado;

  const hayFiltros =
    filtro.termino !== undefined || filtro.perfil !== undefined || filtro.activo !== undefined;

  const conteo =
    paginacion.total === 1 ? "1 usuario encontrado" : `${paginacion.total} usuarios encontrados`;

  const descripcionTabla = hayFiltros
    ? `Usuarios que coinciden con los filtros aplicados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`
    : `Usuarios registrados. Página ${paginacion.pagina} de ${paginacion.totalPaginas}.`;

  return (
    <section>
      <p aria-live="polite" className="mt-6 text-sm font-medium text-gob-gray-a">
        {conteo}
      </p>

      {filas.length > 0 ? (
        <>
          <TablaUsuarios filas={filas.map(aFilaVista)} actorId={actorId} descripcion={descripcionTabla} />
          <PaginacionUsuarios
            paginacion={paginacion}
            filtro={filtro}
            cantidadEnPagina={filas.length}
          />
        </>
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && !hayFiltros ? (
        <EstadoVacio
          titulo="Aún no hay usuarios registrados"
          detalle="Crea la primera cuenta para que el equipo pueda ingresar al sistema."
          accion={
            <Link href={`${RUTA_USUARIOS}/nuevo`} className={CLASES_ENLACE_VACIO}>
              Crear usuario
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total === 0 && hayFiltros ? (
        <EstadoVacio
          titulo={
            filtro.termino
              ? `No se encontraron usuarios para "${filtro.termino}"`
              : "No se encontraron usuarios con esos filtros"
          }
          detalle="Revisa el texto buscado o quita los filtros para ver el padrón completo."
          accion={
            <Link href={RUTA_USUARIOS} className={CLASES_ENLACE_VACIO}>
              Limpiar filtros
            </Link>
          }
        />
      ) : null}

      {filas.length === 0 && paginacion.total > 0 ? (
        <EstadoVacio
          titulo="Esta página no tiene resultados"
          detalle={`La búsqueda tiene ${paginacion.total} resultados repartidos en ${paginacion.totalPaginas} páginas.`}
          accion={
            <Link href={construirRutaUsuarios(filtro, 1)} className={CLASES_ENLACE_VACIO}>
              Ir a la página 1
            </Link>
          }
        />
      ) : null}
    </section>
  );
}
