import { Node } from "@tiptap/core"
import { orderedNodeName } from "./internal/extension-names"
import {
  computeIndent,
  flatListTypeInputRule,
  hasNoContentBeforeChildList,
  replaceParagraphsWithBreaks,
} from "./internal/utils"

export interface FlatListOrderedOptions {
  /**
   * The CSS list-style-type to use for list items at the given indent.
   *
   * Default: always "decimal".
   */
  getListStyleType: (indent: number) => string
}

/**
 * Flat list extension that adds ordered flat list items (analog of `<ol><li>...</li></ol>`).
 *
 * If you use this extension, you must also use the FlatListCore extension.
 */
export const FlatListOrdered = Node.create<FlatListOrderedOptions>({
  name: orderedNodeName,

  group: "block",

  content: "inline*",

  priority: 230,

  defining: true,

  addOptions() {
    return {
      getListStyleType: (_indent) => "decimal",
    }
  },

  addAttributes() {
    return {
      indent: {
        default: 0,
        rendered: false,
      },
      counter: {
        default: 1,
        rendered: false,
      },
      /**
       * Internal attr used to indicate that the list item is being "propped up" by an &nbsp;
       * for help with parsing. It is temporary and will be removed shortly after parsing
       * by our plugins.
       */
      _isTempPropped: {
        default: false,
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [
      // These parse rules work on our rendered HTML as well as arbitrarily nested
      // lists (from pasting / loading normal HTML).
      {
        // LI parsing priority: ordered > task > unordered.
        tag: "li",
        getAttrs: (element) => {
          if (element.parentElement?.tagName === "OL") {
            return {
              indent: computeIndent(element),
              _isTempPropped: hasNoContentBeforeChildList(element),
            }
          } else {
            // Fall through to unordered or task list (if installed).
            return false
          }
        },
        contentElement: (element: HTMLElement) => {
          replaceParagraphsWithBreaks(element)
          if (hasNoContentBeforeChildList(element)) {
            // ProseMirror will ignore such an LI and only parse its child list.
            // Avoid this by propping up the LI with a temporary `&nbsp;`, indicated by _isTempPropped: true.
            // Our plugins watch _isTempPropped and remove this temporary char.
            element.prepend(document.createTextNode("\u00A0"))
          }
          return element
        },
      },
    ]
  },

  renderHTML({ node }) {
    const listStyleType = this.options.getListStyleType(node.attrs.indent ?? 0)
    return [
      "ol",
      {
        start: node.attrs.counter,
        // Apply styling inline since I'm not sure how to include a CSS class in a Tiptap extension.
        // If you add other attrs here that shouldn't appear in copied lists,
        // modify joinListElements to remove them too.
        style: `margin-bottom: 0; margin-left: ${
          20 * node.attrs.indent
        }px; list-style-type: ${listStyleType};`,
      },
      [
        "li",
        {
          // For computeIndent and joinListElements.
          "data-list-indent": node.attrs.indent,
        },
        0,
      ],
    ]
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-7": () => this.editor.commands.toggleFlatListItem("ordered"),
    }
  },

  addInputRules() {
    return [
      // Convert "1. " to an ordered list item if not already.
      flatListTypeInputRule({
        find: /^\s?(\d+)\.\s$/,
        type: this.type,
      }),
    ]
  },
})
