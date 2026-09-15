import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { obtenerUsuario } from "@/modules/usuarios/application/use-cases/ObtenerUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { RUTA_USUARIOS } from "../../ruta-usuarios";
import { EnlaceContrasenaForm } from "./enlace-contrasena-form";

export const metadata: Metadata = {
  title: "Enviar enlace de contraseña - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type EnlaceContrasenaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EnlaceContrasenaPage({ params }: EnlaceContrasenaPageProps) {
  const { id } = await params;
  const idValido = idSchema.safeParse(id);

  if (!idValido.success) {
    notFound();
  }

  const usuario = await obtenerUsuario(idValido.data, { repositorio: prismaUsuarioRepository });

  if (!usuario) {
    notFound();
  }

  const pendiente = !usuario.tieneContrasena;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">
        {pendiente ? "Reenviar enlace de activación" : "Restablecer contraseña"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">
        {pendiente
          ? `Enviaremos a ${usuario.email} un enlace de un solo uso para que ${nombreCompleto(usuario)} cree su contraseña y active la cuenta.`
          : `Enviaremos a ${usuario.email} un enlace de un solo uso para que ${nombreCompleto(usuario)} elija una contraseña nueva. La contraseña actual seguirá funcionando hasta que use el enlace.`}
      </p>

      {usuario.activo ? (
        <EnlaceContrasenaForm usuarioId={usuario.id} />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <p role="alert" className="text-sm font-medium text-gob-danger">
            La cuenta está inactiva. Debes activarla antes de enviar un enlace.
          </p>
          <Link
            href={RUTA_USUARIOS}
            className="w-fit text-sm font-medium text-gob-primary underline underline-offset-2"
          >
            Volver a usuarios
          </Link>
        </div>
      )}
    </div>
  );
}
