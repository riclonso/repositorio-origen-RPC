import type { Metadata } from "next";
import { MarcoPublico } from "@/shared/components/MarcoPublico";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar - Intranet SEREMI de Salud Biobío",
};

type LoginPageProps = {
  searchParams: Promise<{ restablecida?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { restablecida } = await searchParams;

  return (
    <MarcoPublico titulo="Intranet SEREMI de Salud" subtitulo="Región del Biobío">
      {restablecida === "1" ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-gob-accent bg-gob-neutral px-3 py-2 text-sm font-medium text-gob-gray-a"
        >
          Tu contraseña quedó guardada. Ingresa con la contraseña nueva.
        </p>
      ) : null}

      <LoginForm />
    </MarcoPublico>
  );
}
