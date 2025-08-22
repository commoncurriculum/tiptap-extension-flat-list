import { Editor } from "@tiptap/core";
import {
  DOMOutputSpec,
  DOMSerializer,
  Fragment,
  Mark,
  Node,
  Schema,
} from "@tiptap/pm/model";
import { getContentElement, parseIntegerAttr } from "./internal/utils";
import { ListType } from "./list-type";

// Based on https://github.com/ocavue/prosemirror-flat-list/blob/master/packages/core/src/utils/list-serializer.ts

/**
 * DOMSerializer that converts extension-flat-list single-li lists into actual
 * joined & nested lists ("normal" HTML).
 *
 * The serializer sets some inline styling to make these
 * lists look as similar as possible to the flat list in Tiptap.
 *
 * Uses:
 * - Call `JoinListDOMSerializer.setClipboardSerializer(editor)` to make copying use joined & nested lists.
 * - Call `JoinListDOMSerializer.getHTML(editor)` to get that HTML as a string (in place of `editor.getHTML()`).
 */
export class JoinListDOMSerializer extends DOMSerializer {
  constructor(
    /**
    The node serialization functions.
    */
    nodes: {
      [node: string]: (node: Node) => DOMOutputSpec;
    },
    /**
    The mark serialization functions.
    */
    marks: {
      [mark: string]: (mark: Mark, inline: boolean) => DOMOutputSpec;
    },
    readonly usedFor: "getHTML" | "clipboard",
  ) {
    super(nodes, marks);
  }

  private static readonly cache = new WeakMap<
    DOMSerializer,
    { getHTML?: JoinListDOMSerializer; clipboard?: JoinListDOMSerializer }
  >();

  /**
   * Appends our behavior to an arbitrary DOMSerializer.
   */
  static from(
    domSerializer: DOMSerializer,
    usedFor: "getHTML" | "clipboard" = "getHTML",
  ): JoinListDOMSerializer {
    let cachedMap = this.cache.get(domSerializer);
    if (!cachedMap) {
      cachedMap = {};
      this.cache.set(domSerializer, cachedMap);
    }
    if (!cachedMap[usedFor]) {
      cachedMap[usedFor] = new JoinListDOMSerializer(
        domSerializer.nodes,
        domSerializer.marks,
        usedFor,
      );
    }
    return cachedMap[usedFor];
  }

  /**
   * Returns a default serializer for the given schema.
   *
   * It appends our behavior to DOMSerializer.fromSchema(schema).
   */
  static fromSchema(
    schema: Schema,
    usedFor: "getHTML" | "clipboard" = "getHTML",
  ): JoinListDOMSerializer {
    return this.from(DOMSerializer.fromSchema(schema), usedFor);
  }

  /**
   * Sets the editor's clipboardSerializer prop, apppending our behavior to the current value.
   */
  static setClipboardSerializer(editor: Editor) {
    editor.setOptions({
      editorProps: {
        clipboardSerializer: JoinListDOMSerializer.from(
          editor.view.props.clipboardSerializer ??
            DOMSerializer.fromSchema(editor.schema),
          "clipboard",
        ),
      },
    });
  }

  static getHTML(editor: Editor) {
    return this.getDocHTML(editor.state.doc);
  }

  static getDocHTML(doc: Node) {
    // Modified from Tiptap's getHTMLFromFragment.
    const serializer = JoinListDOMSerializer.fromSchema(
      doc.type.schema,
      "getHTML",
    );
    const documentFragment = serializer.serializeFragment(doc.content);

    const temporaryDocument = document.implementation.createHTMLDocument();
    const container = temporaryDocument.createElement("div");

    container.appendChild(documentFragment);

    return container.innerHTML;
  }

  serializeFragment(
    fragment: Fragment,
    options?: { document?: Document },
    target?: HTMLElement | DocumentFragment,
  ): HTMLElement | DocumentFragment {
    const dom = super.serializeFragment(fragment, options, target);
    return joinListElements(dom, this.usedFor);
  }
}

/**
 * Post-processing for the above DOMSerializer.
 *
 * The extensions render each flat list item as a list (ol or ul) containing
 * a single li. This function joins adjacent lists and also nests them when indented.
 *
 * This function also cleans up the HTML a bit, especially when copying, to avoid confusing other programs.
 *
 * @param usedFor Hint used to tune behavior for converting an entire editor state ("getHTML")
 * or copying a fragment to the clipboard ("clipboard").
 */
function joinListElements<T extends Element | DocumentFragment>(
  doc: T,
  usedFor: "getHTML" | "clipboard",
): T {
  // Store the last UL/OL elements for each indent level.
  let lastLists: Element[] = [];

  for (let i = 0; i < doc.children.length; i++) {
    const block = doc.children.item(i) as HTMLElement | null;
    if (!block) continue;

    const listType = getElementListType(block);
    if (listType !== null) {
      const liChild = block.firstChild as HTMLLIElement;
      const indent =
        parseIntegerAttr(liChild.getAttribute("data-list-indent")) ?? 0;

      if (usedFor === "getHTML") {
        // Remove this to clean up the saved HTML.
        // We leave it in when copying so that pasting back into Tiptap remembers backwards
        // indents that we can't represent in plain HTML (e.g.: 1, 0, 1).
        liChild.removeAttribute("data-list-indent");
      }
      if (usedFor === "clipboard") {
        // Simplify the LI content: make the LI its own content element, removing the task checkbox.
        // This avoids confusing other programs, at the cost of converting tasks into bullets.
        // (For pasting into ourselves, we'll remember that it's a task using data attributes.)
        const contentElement = getContentElement(listType, liChild);
        if (contentElement !== liChild) {
          const children = Array.from(contentElement.childNodes);
          liChild.replaceChildren(...children);
        }

        // Let the target program decide what LI formatting to use.
        liChild.removeAttribute("style");
      }

      const lastList = lastLists[indent];
      if (lastList === undefined || getElementListType(lastList) !== listType) {
        // child starts a new list.

        // 1. Remove extraneous attrs/styles.
        block.removeAttribute("start");
        block.style.removeProperty("margin-left");
        if (usedFor === "clipboard") {
          // Let the target program decide what OL/UL formatting to use.
          block.removeAttribute("style");
        }

        // 2. Nest under previous indent level's list.
        // Note: If you copy an indented list item without its previous list items,
        // this won't work, so it will lose the indent when pasted to other programs.
        // I think that's okay as GDocs behaves similarly.
        if (indent > 0 && lastLists[indent - 1] !== undefined) {
          // Note: If the wrapperLi has no content before this child, you end up with
          // <li><ol>... in the HTML, which "collapses" (the ol's first list item shows up on
          // the same line as the li.). This is the same problem as https://github.com/ueberdosis/tiptap/issues/1500
          // and can be solved by adding BRs to such LIs.
          // E.g., call `JoinListDOMSerializer.getDocHTML(addExternalTrailingBreaks(editor.state.doc))`,
          // where `addExternalTrailingBreaks` is from the ExternalTrailingBreaks extension; this will
          // add a BR to the LI before joinListElements is called, so that wrapperLi always has content.

          const parentList = lastLists[indent - 1];
          const parentListType = getElementListType(parentList)!;
          const parentLi = parentList.lastChild as HTMLElement;
          getContentElement(parentListType, parentLi).append(block);
          i--;
        }

        // 3. Reset the lastLists for it and higher indent levels.
        lastLists[indent] = block;
        lastLists.length = indent + 1;
      } else {
        // Append child's li to the existing list.
        lastList.append(liChild);
        block.remove();
        i--;

        // Reset the lastLists for higher indent levels.
        lastLists.length = indent + 1;
      }
    } else {
      // Not a list block. Reset all lastLists.
      lastLists = [];
    }
  }
  return doc;
}

/**
 * Given a candidate flat-list wrapper OL/UL, return its ListType, or null if it is not one.
 */
function getElementListType(element: Element): ListType | null {
  if (element.tagName === "OL") return "ordered";
  else if (element.tagName === "UL") {
    const attrTaskList = element.getAttribute("data-task-list");
    if (attrTaskList === "" || attrTaskList === "true") return "task";
    else return "unordered";
  } else return null;
}
