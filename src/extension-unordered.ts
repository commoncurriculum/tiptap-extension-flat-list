import { Node } from "@tiptap/core";
import { unorderedNodeName } from "./internal/extension-names";
import {
  computeIndent,
  flatListTypeInputRule,
  replaceParagraphsWithBreaks,
} from "./internal/utils";

export interface FlatListUnorderedOptions {
  /**
   * The CSS list-style-type to use for list items at the given indent.
   *
   * Default: always "disc".
   */
  getListStyleType: (indent: number) => string;
}

/**
 * Flat list extension that adds unordered flat list items (analog of `<ul><li>...</li></ul>`).
 *
 * If you use this extension, you must also use the FlatListCore extension.
 */
export const FlatListUnordered = Node.create<FlatListUnorderedOptions>({
  name: unorderedNodeName,

  group: "block",

  content: "inline*",

  priority: 210,

  defining: true,

  addOptions() {
    return {
      getListStyleType: (_indent) => "disc",
    };
  },

  addAttributes() {
    return {
      indent: {
        default: 0,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      // These parse rules work on our rendered HTML as well as arbitrarily nested
      // lists (from pasting / loading normal HTML).
      {
        // LI parsing priority: ordered > task > unordered.
        // So if you don't install the other extensions, all lists become unordered.
        tag: "li",
        getAttrs: (element) => {
          return {
            indent: computeIndent(element),
          };
        },
        contentElement: (element: HTMLElement) => {
          replaceParagraphsWithBreaks(element);
          return element;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const listStyleType = this.options.getListStyleType(node.attrs.indent ?? 0);
    return [
      "ul",
      {
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
    ];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-8": () => this.editor.commands.toggleFlatListItem("unordered"),
    };
  },

  addInputRules() {
    return [
      // Convert "- " to an unordered list item if not already.
      flatListTypeInputRule({
        find: /^\s?([*\-+])\s$/,
        type: this.type,
      }),
    ];
  },
});
