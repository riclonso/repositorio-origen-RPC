import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { obtenerUsuario } from "@/modules/usuarios/application/use-cases/ObtenerUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { ContrasenaForm } from "./contrasena-form";

export const metadata: Metadata = {
  title: "Restablecer contraseña - Intranet SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type ContrasenaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContrasenaUsuarioPage({ params }: ContrasenaPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const usuario = await obtenerUsuario(idValido.data, { repositorio: prismaUsuarioRepository });

  if (!usuario) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Restablecer contraseña</h1>
      <p className="mt-2 text-sm text-gob-gray-a">
        Cuenta de {nombreCompleto(usuario)}, RUT {usuario.rut}. La contraseña anterior deja de
        funcionar apenas se guarda la nueva.
      </p>

      <ContrasenaForm usuarioId={usuario.id} />
    </div>
  );
}
