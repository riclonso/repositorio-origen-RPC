import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerUsuario } from "@/modules/usuarios/application/use-cases/ObtenerUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { listarPerfiles } from "@/modules/perfiles/application/use-cases/ListarPerfiles";
import { prismaPerfilRepository } from "@/modules/perfiles/infrastructure/repositories/PrismaPerfilRepository";
import { aOpcionesPerfil } from "../../opciones-perfil";
import { UsuarioForm } from "../../usuario-form";

export const metadata: Metadata = {
  title: "Editar usuario - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EditarUsuarioPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarUsuarioPage({ params }: EditarUsuarioPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const usuario = await obtenerUsuario(idValido.data, { repositorio: prismaUsuarioRepository });

  if (!usuario) {
    notFound();
  }

  // El perfil vigente de la persona se incluye aunque esté dado de baja. Sin esto, editar el
  // email de alguien cuyo perfil fue desactivado mostraría un select sin su valor actual: el
  // navegador elegiría otra opción y guardar le cambiaría el perfil en silencio.
  const perfiles = await listarPerfiles(
    { soloActivos: true, incluirCodigos: [usuario.perfilCodigo] },
    { repositorio: prismaPerfilRepository },
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Editar usuario</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Actualiza los datos de la cuenta. El RUT y el nombre de usuario no son editables porque
        el RUT es la credencial con la que la persona ingresa al sistema.
      </p>

      <dl className="card-sistema mt-6 grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-gob-black">RUT</dt>
          <dd className="mt-1 text-sm text-gob-gray-a">{usuario.rut}</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gob-black">Nombre de usuario</dt>
          <dd className="mt-1 text-sm text-gob-gray-a">{usuario.username}</dd>
        </div>
      </dl>

      <UsuarioForm
        modo="editar"
        endpoint={`/api/usuarios/${usuario.id}`}
        metodo="PUT"
        valoresIniciales={{
          nombres: usuario.nombres,
          apellidos: usuario.apellidos,
          rut: usuario.rut,
          email: usuario.email,
          perfilCodigo: usuario.perfilCodigo,
        }}
        opcionesPerfil={aOpcionesPerfil(perfiles)}
      />
    </div>
  );
}
