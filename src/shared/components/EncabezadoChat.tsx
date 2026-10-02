import { IconoCerrar, IconoMensaje } from "@/shared/components/iconos";
import estilos from "./Chat.module.css";

type EncabezadoChatProps = {
  idTitulo: string;
  titulo: string;
  subtitulo: string;
  etiquetaCerrar: string;
  onCerrar: () => void;
};

export function EncabezadoChat({ idTitulo, titulo, subtitulo, etiquetaCerrar, onCerrar }: EncabezadoChatProps) {
  return (
    <header className={estilos.encabezado}>
      <span aria-hidden="true" className={estilos.avatar}><IconoMensaje /></span>
      <div className={estilos.titulos}>
        <h2 id={idTitulo} className={estilos.titulo}>{titulo}</h2>
        <p className={estilos.subtitulo} title={subtitulo}>{subtitulo}</p>
      </div>
      <button type="button" onClick={onCerrar} aria-label={etiquetaCerrar} className={estilos.cerrar}>
        <IconoCerrar />
      </button>
    </header>
  );
}
