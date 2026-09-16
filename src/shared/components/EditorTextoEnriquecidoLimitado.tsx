"use client";

import { useCallback, useEffect, useLayoutEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { $createLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
} from "lexical";
import { BotonIcono } from "@/shared/components/BotonIcono";
import { IconoCursiva, IconoEnlace, IconoListaVinetas, IconoNegrita } from "@/shared/components/iconos";
import { MARCADOR_ENLACE_SISTEMA } from "@/modules/ventanas-carga/domain/entities/PlantillaAlerta";

const TEXTO_ENLACE_POR_DEFECTO = "Ingresa aquí";

// `LinkNode.sanitizeUrl()` (interno de `@lexical/link`, no configurable desde fuera) le antepone
// `https://` a cualquier `url` que no empiece con un esquema reconocido, un `/`, un `#` o incluya
// `@` — y esa función corre SIEMPRE que el nodo se renderiza a DOM, tanto en el editor visible
// (`createDOM`/`updateDOM`) como al exportar HTML (`exportDOM`, heredado de `LexicalNode`, llama
// internamente al mismo `createDOM`). Nuestro marcador `{{enlaceSistema}}` no calza ninguna de esas
// formas, así que queda corrompido a `https://{{enlaceSistema}}` en ambos casos — sin tocar el
// estado interno del nodo (`getURL()` sigue devolviendo el marcador limpio), solo lo que se ve y lo
// que se exporta. `CorregirEnlaceSistemaPlugin` corrige el DOM visible; `corregirMarcadorEnlaceHtml`
// corrige el HTML exportado antes de que salga de este componente.
const MARCADOR_ENLACE_CORROMPIDO = `https://${MARCADOR_ENLACE_SISTEMA}`;

function corregirMarcadorEnlaceHtml(html: string): string {
  return html.replaceAll(`href="${MARCADOR_ENLACE_CORROMPIDO}"`, `href="${MARCADOR_ENLACE_SISTEMA}"`);
}

// Alterna negrita/cursiva sobre la selección activa, mismo formato que dispara la barra de
// herramientas estándar de Lexical.
function alternarFormatoTexto(editor: LexicalEditor, formato: "bold" | "italic"): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, formato);
}

function insertarListaConVinetas(editor: LexicalEditor): void {
  editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
}

// El botón "Enlace al sistema" SIEMPRE apunta al marcador fijo `MARCADOR_ENLACE_SISTEMA`: nunca
// expone un campo donde el operador pueda escribir un destino distinto. Sin selección activa,
// inserta un texto por defecto ya envuelto en el enlace, en vez de crear un enlace vacío.
function insertarEnlaceAlSistema(editor: LexicalEditor): void {
  editor.update(() => {
    const seleccion = $getSelection();

    if ($isRangeSelection(seleccion) && !seleccion.isCollapsed()) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, MARCADOR_ENLACE_SISTEMA);
      return;
    }

    const nodoEnlace = $createLinkNode(MARCADOR_ENLACE_SISTEMA);
    nodoEnlace.append($createTextNode(TEXTO_ENLACE_POR_DEFECTO));
    $insertNodes([nodoEnlace]);
  });
}

// Barra de EXACTAMENTE 4 botones (Negrita, Cursiva, Lista con viñetas, Enlace al sistema). Hijo
// de `LexicalComposer`: lee el editor activo por contexto, no por prop.
function BarraHerramientasEditorAlerta({ deshabilitado }: { deshabilitado: boolean }) {
  const [editor] = useLexicalComposerContext();

  return (
    <div className="flex items-center gap-2 border-b border-gob-accent bg-gob-neutral px-3 py-2">
      <BotonIcono
        etiqueta="Negrita"
        Icono={IconoNegrita}
        onClick={() => alternarFormatoTexto(editor, "bold")}
      />
      <BotonIcono
        etiqueta="Cursiva"
        Icono={IconoCursiva}
        onClick={() => alternarFormatoTexto(editor, "italic")}
      />
      <BotonIcono
        etiqueta="Lista con viñetas"
        Icono={IconoListaVinetas}
        onClick={() => insertarListaConVinetas(editor)}
      />
      <BotonIcono
        etiqueta="Enlace al sistema"
        Icono={IconoEnlace}
        onClick={() => insertarEnlaceAlSistema(editor)}
      />
      {deshabilitado ? <span className="sr-only">Editor deshabilitado</span> : null}
    </div>
  );
}

// Carga el HTML inicial DESPUÉS de montar, nunca en `initialConfig.editorState`: ese callback lo
// invoca `LexicalComposer` durante el render (incluido el pase de SSR de este Client Component —
// Next.js igual ejecuta un pase de servidor antes de hidratar), y `DOMParser` no existe en Node.
// `useLayoutEffect` (no `useEffect`) para que la población ocurra antes del primer paint del
// navegador: el cuerpo sigue sin ejecutarse en ningún pase de servidor (React solo llama a los
// efectos de layout en el cliente, igual que a los efectos normales), así que no reintroduce el
// problema de SSR; solo evita el frame en que el editor se ve vacío antes de poblarse. Sin guarda
// de "ya cargado": cada instancia de `LexicalComposer` se crea una sola vez por
// `idNamespace`/`key` (el remount de "Restaurar plantilla por defecto" pasa por una `key` nueva en
// el componente padre), así que este efecto corre una vez por instancia real.
//
// `{ tag: HISTORY_MERGE_TAG }` (de `lexical`, no de `@lexical/history`: la constante vive en el
// paquete núcleo, que es quien define y consume las etiquetas de actualización) marca esta
// actualización para que `HistoryPlugin` no la registre como un paso editable por el usuario. Sin
// el tag, cargar la plantilla (o el mensaje precargado del modal individual) quedaba como el
// primer paso del historial de deshacer: un Ctrl+Z justo después de que carga vaciaba el editor en
// vez de no hacer nada.
function CargarHtmlInicialPlugin({ html }: { html: string }) {
  const [editor] = useLexicalComposerContext();

  useLayoutEffect(() => {
    editor.update(
      () => {
        const dom = new DOMParser().parseFromString(html, "text/html");
        const nodos = $generateNodesFromDOM(editor, dom);
        $getRoot().clear();
        $getRoot().select();
        $insertNodes(nodos);
      },
      { tag: HISTORY_MERGE_TAG },
    );
    // Deliberadamente sin `html` en las dependencias más allá del montaje inicial: este plugin
    // solo debe poblar el editor una vez, al montar. Si `valorInicialHtml` cambia de verdad (p. ej.
    // "Restaurar plantilla por defecto"), el padre fuerza un remount completo vía `key`, que ya
    // crea una instancia nueva de este plugin con el `html` nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return null;
}

// Corrige en el DOM visible del editor el `href` que `LinkNode.sanitizeUrl()` corrompe a
// `https://{{enlaceSistema}}` (ver comentario de `MARCADOR_ENLACE_CORROMPIDO` arriba). Se
// registra una vez y reacciona a toda creación/actualización de un `LinkNode`, incluida la carga
// inicial (`registerMutationListener` dispara de entrada con `created` para los nodos ya
// presentes al registrarse). Solo toca el atributo DOM, nunca el estado interno del nodo — que ya
// almacena el marcador limpio (`getURL()`), sin necesidad de corregirlo.
function CorregirEnlaceSistemaPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerMutationListener(LinkNode, (nodosMutados) => {
      for (const [claveNodo, mutacion] of nodosMutados) {
        if (mutacion === "destroyed") continue;

        const elemento = editor.getElementByKey(claveNodo);
        if (elemento instanceof HTMLAnchorElement && elemento.getAttribute("href") === MARCADOR_ENLACE_CORROMPIDO) {
          elemento.setAttribute("href", MARCADOR_ENLACE_SISTEMA);
        }
      }
    });
  }, [editor]);

  return null;
}

// Sincroniza el HTML serializado hacia el padre en cada cambio del editor. `editor.read()` (y no
// el legado `editorState.read(callback)` sin `{editor}`) es el reemplazo soportado para fijar el
// editor activo que `$generateHtmlFromNodes` necesita (ver `@lexical/html`). El resultado pasa por
// `corregirMarcadorEnlaceHtml` antes de salir: sin esto, el HTML que llega a
// `sanitizarPlantillaAlertaHtml` en el servidor traería el marcador corrompido y el enlace se
// degradaría a texto plano en cada guardado (fallo seguro — la sanitización nunca deja pasar un
// `href` que no calce exacto — pero rompe la función de todas formas).
function SincronizadorHtml({ onChangeHtml }: { onChangeHtml: (html: string) => void }) {
  const [editor] = useLexicalComposerContext();

  const alCambiar = useCallback(() => {
    editor.read(() => {
      onChangeHtml(corregirMarcadorEnlaceHtml($generateHtmlFromNodes(editor)));
    });
  }, [editor, onChangeHtml]);

  return <OnChangePlugin onChange={alCambiar} ignoreSelectionChange />;
}

const NODOS = [ListNode, ListItemNode, LinkNode];

type EditorTextoEnriquecidoLimitadoProps = {
  // Identifica la instancia del editor ante Lexical; también se usa como `key` en el remount
  // forzado por "Restaurar plantilla por defecto" (ver `FormularioPlantillaAlertaVentana`).
  idNamespace: string;
  valorInicialHtml: string;
  onChangeHtml: (html: string) => void;
  disabled?: boolean;
  idDescripcion?: string;
};

function alError(error: Error): void {
  throw error;
}

// Editor de texto enriquecido acotado a lo que la plantilla de alerta necesita: negrita, cursiva,
// lista con viñetas y un único enlace fijo al sistema. Serializa/deserializa como HTML (nunca
// como el JSON interno de Lexical): lo que persiste el servidor es siempre HTML, sanitizado en
// `application/` con `sanitizarPlantillaAlertaHtml` antes de guardarse — este componente no
// sanea nada, solo produce el HTML que el editor visual representa.
export function EditorTextoEnriquecidoLimitado({
  idNamespace,
  valorInicialHtml,
  onChangeHtml,
  disabled = false,
  idDescripcion,
}: EditorTextoEnriquecidoLimitadoProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: idNamespace,
        nodes: NODOS,
        editable: !disabled,
        onError: alError,
      }}
    >
      <div className="overflow-hidden rounded-md border border-gob-accent bg-white">
        <BarraHerramientasEditorAlerta deshabilitado={disabled} />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-describedby={idDescripcion}
              className="min-h-40 px-3 py-2 text-sm text-gob-black outline-none"
            />
          }
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <LinkPlugin />
        <CargarHtmlInicialPlugin html={valorInicialHtml} />
        <CorregirEnlaceSistemaPlugin />
        <SincronizadorHtml onChangeHtml={onChangeHtml} />
      </div>
    </LexicalComposer>
  );
}
