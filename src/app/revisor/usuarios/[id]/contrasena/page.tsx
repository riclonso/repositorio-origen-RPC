import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { nombreCompleto } from "@/modules/usuarios/domain/entities/Usuario";
import { obtenerUsuario } from "@/modules/usuarios/application/use-cases/ObtenerUsuario";
import { prismaUsuarioRepository } from "@/modules/usuarios/infrastructure/repositories/PrismaUsuarioRepository";
import { EnlaceContrasenaForm } from "@/shared/components/EnlaceContrasenaForm";
import { ContrasenaForm } from "@/shared/components/ContrasenaForm";
import { RUTA_USUARIOS_REVISOR } from "../../ruta-usuarios";

export const metadata: Metadata = {
  title: "Contraseña de usuario - Repositorio RPC - SEREMI de Salud Biobío",
};

const idSchema = z.uuid();

type ContrasenaRevisorPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContrasenaRevisorPage({ params }: ContrasenaRevisorPageProps) {
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
  const persona = nombreCompleto(usuario);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-gob-black">Contraseña de {persona}</h1>
      <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">
        {pendiente
          ? "La cuenta está pendiente de activación (aún no tiene contraseña). Elige cómo definirla."
          : "Elige cómo cambiar la contraseña de esta persona."}
      </p>

      {!usuario.activo ? (
        <div className="mt-6 flex flex-col gap-4">
          <p role="alert" className="text-sm font-medium text-gob-danger">
            La cuenta está inactiva. Debes activarla antes de definir su contraseña.
          </p>
          <Link
            href={RUTA_USUARIOS_REVISOR}
            className="w-fit text-sm font-medium text-gob-primary underline underline-offset-2"
          >
            Volver a usuarios
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-5">
            {/* Opción 1: la persona la fija por correo (recomendada: el administrador nunca conoce
                la contraseña de otra persona). */}
            <section
              aria-labelledby="titulo-enlace"
              className="rounded-lg border border-gob-accent bg-white p-5"
            >
              <h2 id="titulo-enlace" className="text-base font-semibold text-gob-tertiary">
                Opción 1 · Enviar un enlace por correo
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">
                {pendiente
                  ? `Enviaremos a ${usuario.email} un enlace de un solo uso para que ${persona} cree su contraseña y active la cuenta.`
                  : `Enviaremos a ${usuario.email} un enlace de un solo uso para que ${persona} elija una contraseña nueva. La contraseña actual seguirá funcionando hasta que use el enlace.`}
              </p>
              <EnlaceContrasenaForm usuarioId={usuario.id} rutaBase={RUTA_USUARIOS_REVISOR} />
            </section>

            {/* Opción 2: el administrador la fija directamente. */}
            <section
              aria-labelledby="titulo-manual"
              className="rounded-lg border border-gob-accent bg-white p-5"
            >
              <h2 id="titulo-manual" className="text-base font-semibold text-gob-tertiary">
                Opción 2 · Definir la contraseña manualmente
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-gob-gray-a">
                Tú defines la contraseña ahora y se la comunicas a la persona.
                {pendiente ? " Esto activa la cuenta de inmediato." : ""} La persona podrá cambiarla
                después. Cualquier enlace de contraseña pendiente quedará sin efecto.
              </p>
              <ContrasenaForm usuarioId={usuario.id} rutaBase={RUTA_USUARIOS_REVISOR} />
            </section>
          </div>

          <div className="mt-6">
            <Link
              href={RUTA_USUARIOS_REVISOR}
              className="text-sm font-medium text-gob-primary underline underline-offset-2"
            >
              Volver a usuarios
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
