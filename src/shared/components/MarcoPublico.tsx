import type { ReactNode } from "react";

type MarcoPublicoProps = {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
};

// Marco común de las pantallas públicas (login, solicitar recuperación, elegir contraseña
// nueva). Estaba embebido en `app/login/page.tsx`; se extrajo para que las tres se vean
// iguales sin copiar el marcado.
export function MarcoPublico({ titulo, subtitulo, children }: MarcoPublicoProps) {
  return (
    <div className="flex flex-1 flex-col bg-linear-to-b from-gob-neutral to-white">
      <header className="border-b border-gob-primary-oscuro/20 bg-gob-primary px-6 py-4 shadow-sm">
        <p className="text-sm font-medium tracking-wide text-white">Gobierno de Chile</p>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm animate-aparecer overflow-hidden rounded-2xl border border-[#e6edf5] bg-white shadow-[0_10px_30px_rgba(27,57,92,0.08)]">
          <div className="h-1.5 bg-gob-primary" aria-hidden="true" />

          <div className="p-8">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold text-gob-black">{titulo}</h1>
              {subtitulo ? <p className="mt-1 text-sm text-gob-gray-a">{subtitulo}</p> : null}
            </div>

            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

// Estilo único de los enlaces de navegación de las pantallas públicas. `gob-primary` y no
// `gob-gray-b`: ese gris no alcanza el contraste AA como texto.
export const CLASES_ENLACE_PUBLICO =
  "rounded-sm font-medium text-gob-primary underline underline-offset-2 hover:text-gob-primary-oscuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary";
