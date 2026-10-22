import { ETIQUETA_ETAPA_FALLA, type EtapaFallaCorreo } from "@/infrastructure/logging/catalogoFallasCorreo";
import type { EntradaLog } from "@/infrastructure/logging/leerLogs";
import { BotonVerCorreo } from "./boton-ver-correo";
import { leerFallaCorreo, type FallaCorreoVista } from "./vista-falla-correo";

// Insignia por etapa: ENVIO y PREPARACION son fallas (rojo); SIN_CONFIGURACION es un problema de
// despliegue, no de un envío puntual (fondo ámbar de advertencia, texto gob-tertiary). El texto,
// no solo el color, distingue la etapa.
const CLASES_ETAPA: Record<EtapaFallaCorreo, string> = {
  ENVIO: "border-gob-danger/30 bg-gob-danger/5 text-gob-danger",
  PREPARACION: "border-gob-danger/30 bg-gob-danger/5 text-gob-danger",
  SIN_CONFIGURACION: "border-gob-accent bg-gob-warning-fondo text-gob-tertiary",
};

const CLASES_ETAPA_DESCONOCIDA = "border-gob-accent bg-gob-neutral text-gob-gray-a";

function describirDestinatario(destinatario: FallaCorreoVista["destinatario"]): string {
  if (destinatario.esBuzonCompartido) {
    return destinatario.email
      ? `Buzón compartido del equipo revisor (${destinatario.email})`
      : "Buzón compartido del equipo revisor";
  }

  const partes = [destinatario.nombre, destinatario.rut, destinatario.email].filter(
    (parte): parte is string => parte !== null,
  );
  return partes.length > 0 ? partes.join(" · ") : "Destinatario no determinado";
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-gob-gray-a">{etiqueta}</dt>
      <dd className="mt-0.5 wrap-break-word text-sm text-gob-tertiary">{valor}</dd>
    </div>
  );
}

// RF-44: una fila del registro de fallas de envío de correo. Server Component: solo el botón
// "Ver correo" (con su modal) corre en el cliente.
export function EntradaFallaCorreo({
  entrada,
  fechaHora,
}: {
  entrada: EntradaLog;
  fechaHora: string;
}) {
  const falla = leerFallaCorreo(entrada.campos);
  const destinatario = describirDestinatario(falla.destinatario);

  return (
    <article className="overflow-hidden rounded-xl border border-l-4 border-y-[#f0d0d0] border-r-[#f0d0d0] border-l-gob-danger bg-white shadow-[0_6px_18px_rgba(23,59,105,0.035)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold tracking-wide ${
            falla.etapa ? CLASES_ETAPA[falla.etapa] : CLASES_ETAPA_DESCONOCIDA
          }`}
        >
          {falla.etapa ? ETIQUETA_ETAPA_FALLA[falla.etapa] : "Falla"}
        </span>
        <span className="rounded bg-[#f3f6f8] px-2 py-1 font-mono text-[11px] tabular-nums text-gob-gray-a">
          {fechaHora}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-gob-tertiary">{falla.tipoAvisoTexto}</p>
        {falla.correo ? (
          <BotonVerCorreo
            asunto={falla.correo.asunto}
            cuerpo={falla.correo.cuerpo}
            descripcionDestinatario={destinatario}
          />
        ) : null}
      </div>

      <dl className="grid gap-3 border-t border-[#e3ebf2] px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        <Dato etiqueta="Emisor" valor={falla.emisor ?? "Sin remitente configurado"} />
        <Dato etiqueta="Destinatario" valor={destinatario} />
        <Dato etiqueta="Ventana" valor={falla.ventanaNombre ?? "No aplica"} />
      </dl>

      {falla.mensajeFalla ? (
        <div className="border-t border-[#e3ebf2] px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-gob-gray-a">Mensaje de la falla</p>
          <pre className="mt-1 whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-gob-black">
            {falla.mensajeFalla}
          </pre>
        </div>
      ) : null}
    </article>
  );
}
