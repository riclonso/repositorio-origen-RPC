import type { Metadata } from "next";
import Link from "next/link";
import { CLASES_ENLACE_PUBLICO, MarcoPublico } from "@/shared/components/MarcoPublico";
import { ConfirmarForm } from "./confirmar-form";

export const metadata: Metadata = {
  title: "Elegir contraseña nueva - Repositorio RPC - SEREMI de Salud Biobío",
  robots: { index: false, follow: false },
  // Corta la fuga del token por la cabecera `Referer` hacia cualquier recurso externo. Es la
  // contrapartida de llevar el token en la query string.
  referrer: "no-referrer",
};

type ConfirmarPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ConfirmarRecuperacionPage({ searchParams }: ConfirmarPageProps) {
  const { token } = await searchParams;
  const tokenRecibido = Array.isArray(token) ? token[0] : token;

  // La página NO pre-valida el token contra la base: hacerlo convertiría una simple visita en
  // un oráculo de validez y gastaría una consulta por cada visita. La validez se resuelve
  // recién al enviar la contraseña.
  if (!tokenRecibido) {
    return (
      <MarcoPublico titulo="Enlace no válido">
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm leading-relaxed text-gob-gray-a">
            El enlace no es válido o ya venció. Solicita uno nuevo.
          </p>
          <p className="text-center text-sm">
            <Link href="/recuperar" className={CLASES_ENLACE_PUBLICO}>
              Solicitar un enlace nuevo
            </Link>
          </p>
        </div>
      </MarcoPublico>
    );
  }

  return (
    <MarcoPublico
      titulo="Elegir contraseña nueva"
      subtitulo="La contraseña anterior deja de funcionar apenas se guarda la nueva"
    >
      <ConfirmarForm token={tokenRecibido} />
    </MarcoPublico>
  );
}
