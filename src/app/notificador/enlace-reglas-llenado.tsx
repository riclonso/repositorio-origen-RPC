import { IconoDocumento } from "@/shared/components/iconos";

type EnlaceReglasLlenadoProps = {
  ventanaCargaId: string;
  // Nombre del archivo de reglas del formato; `null` si el formato no tiene (se oculta el enlace).
  nombreArchivo: string | null;
  // Formato y año de la tarjeta: distingue los enlaces entre tarjetas para lectores de pantalla.
  etiquetaTarjeta: string;
};

// RF-45: descarga de las reglas para llenar el archivo a notificar, por ventana. La autorización la
// decide el servidor con el mismo predicado que da la tarjeta.
export function EnlaceReglasLlenado({
  ventanaCargaId,
  nombreArchivo,
  etiquetaTarjeta,
}: EnlaceReglasLlenadoProps) {
  if (!nombreArchivo) return null;

  return (
    <a
      href={`/api/notificador/ventanas-carga/${ventanaCargaId}/reglas-llenado`}
      download
      title={nombreArchivo}
      aria-label={`Descargar reglas para llenado de archivo de ${etiquetaTarjeta} (${nombreArchivo})`}
      className="inline-flex w-fit items-center gap-2 rounded-md border border-gob-primary bg-white px-3 py-2 text-sm font-semibold text-gob-primary transition-colors hover:bg-gob-neutral active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gob-primary"
    >
      <IconoDocumento className="shrink-0" />
      Reglas para llenado de archivo
    </a>
  );
}
