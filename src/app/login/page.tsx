import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar — Intranet SEREMI de Salud Biobío",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col bg-gob-neutral">
      <header className="bg-gob-tertiary px-6 py-4">
        <p className="text-sm font-medium tracking-wide text-white">Gobierno de Chile</p>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-gob-accent bg-white p-8 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-gob-black">Intranet SEREMI de Salud</h1>
            <p className="mt-1 text-sm text-gob-gray-a">Región del Biobío</p>
          </div>

          <LoginForm />
        </div>
      </main>
    </div>
  );
}
