import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { obtenerSesionActual } from "@/modules/auth/infrastructure/auth/SesionActual";
import { listarPerfiles } from "@/modules/perfiles/application/use-cases/ListarPerfiles";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import type { FiltroListadoUsuarios } from "@/modules/usuarios/domain/entities/Usuario";
import {
  FILTRO_LISTADO_POR_DEFECTO,
  listadoUsuariosSchema,
} from "@/modules/usuarios/schemas/listado-usuarios.schema";
import { EsqueletoTablaUsuarios } from "@/shared/components/EsqueletoTablaUsuarios";
import { aOpcionesPerfil } from "@/shared/components/opciones-perfil";
import { FiltrosUsuarios } from "@/shared/components/FiltrosUsuarios";
import { ListadoUsuarios } from "@/shared/components/ListadoUsuarios";
import { RUTA_USUARIOS_REVISOR, construirRutaUsuariosRevisor } from "./ruta-usuarios";

export const metadata: Metadata = {
  title: "Usuarios - Repositorio RPC - SEREMI de Salud Biobío",
};

type UsuariosRevisorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Mismo mantenedor que `/dashboard/usuarios` (RF-06 extendido a REVISOR_REPOSITORIO): acceso
// completo a las seis operaciones, salvo sobre cuentas con perfil ADMIN (ver
// `TablaUsuarios`/`CrearUsuario`/`ActualizarUsuario`/`CambiarEstadoUsuario`/
// `RestablecerContrasena`/`EmitirEnlaceContrasena`, que rechazan esa combinación con
// PERFIL_ADMIN_RESTRINGIDO). La pantalla comparte componentes con `shared/components/`, y los
// endpoints bajo `/api/usuarios/**` (guardados con `exigirAdminORevisor()`) son los mismos para
// ambos paneles.
export default async function UsuariosRevisorPage({ searchParams }: UsuariosRevisorPageProps) {
  const parametros = await searchParams;
  const usuarioCreado = parametros.creado === "1";
  const enlaceEnviado = parametros.enlace === "enviado";
  const contrasenaDefinida = parametros.contrasena === "definida";

  // Modo tolerante: una URL editada a mano por el operador cae a los valores por defecto
  // en vez de romper la pantalla. El Route Handler, en cambio, responde 400.
  const analisis = listadoUsuariosSchema.safeParse(parametros);
  const filtro: FiltroListadoUsuarios = analisis.success
    ? analisis.data
    : { ...FILTRO_LISTADO_POR_DEFECTO };

  // Se ofrecen TODOS los perfiles, incluidos los dados de baja: un perfil desactivado que aún
  // tiene usuarios debe poder filtrarse, si no esas cuentas quedan sin forma de encontrarse.
  const [sesion, perfiles] = await Promise.all([
    obtenerSesionActual(),
    listarPerfiles({}, { repositorio: prismaPerfilRepository }),
  ]);

  const actorId = sesion?.sub ?? "";
  const claveFiltro = construirRutaUsuariosRevisor(filtro);

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
          href={`${RUTA_USUARIOS_REVISOR}/nuevo`}
          className="inline-flex items-center justify-center rounded-md bg-gob-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gob-tertiary active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
        >
          Nuevo usuario
        </Link>
      </div>

      <FiltrosUsuarios
        key={`filtros:${claveFiltro}`}
        terminoInicial={filtro.termino ?? ""}
        perfilInicial={filtro.perfil ?? ""}
        activoInicial={filtro.activo === undefined ? "" : String(filtro.activo)}
        tamano={filtro.tamano}
        opcionesPerfil={aOpcionesPerfil(perfiles)}
        rutaBase={RUTA_USUARIOS_REVISOR}
      />

      {usuarioCreado || enlaceEnviado || contrasenaDefinida ? (
        <p
          role="status"
          className="mt-5 rounded-lg border border-gob-success/30 bg-gob-success/10 px-4 py-3 text-sm font-medium text-gob-gray-a"
        >
          {usuarioCreado
            ? "Usuario creado. El enlace para crear su contraseña se está enviando al correo registrado."
            : contrasenaDefinida
              ? "Contraseña definida. La persona ya puede iniciar sesión con ella."
              : "Enlace enviado al correo registrado."}
        </p>
      ) : null}

      {/* La key hace reaparecer el esqueleto en cada búsqueda y en cada salto de página;
          loading.tsx solo cubre la primera entrada al segmento. */}
      <Suspense key={`listado:${claveFiltro}`} fallback={<EsqueletoTablaUsuarios />}>
        <ListadoUsuarios
          filtro={filtro}
          actorId={actorId}
          rutaBase={RUTA_USUARIOS_REVISOR}
          construirHref={(pagina) => construirRutaUsuariosRevisor(filtro, pagina)}
          actorEsAdmin={false}
        />
      </Suspense>
    </div>
  );
}
