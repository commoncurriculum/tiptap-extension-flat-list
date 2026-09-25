import { Node, type JSONContent } from "@tiptap/core";
import { orderedNodeName } from "./internal/extension-names";
import {
  parseItemContent,
  parseNestedLists,
  renderFlatListMarkdown,
} from "./internal/markdown";
import {
  computeIndent,
  flatListTypeInputRule,
  getIndent,
  indentAttr,
  replaceParagraphsWithBreaks,
} from "./internal/utils";

export interface FlatListOrderedOptions {
  /**
   * The CSS list-style-type to use for list items at the given indent.
   *
   * Default: always "decimal".
   */
  getListStyleType: (indent: number) => string;
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
    };
  },

  addAttributes() {
    return {
      indent: {
        // 0 -> undefined, to save space in the JSON.
        default: undefined,
        rendered: false,
      },
      counter: {
        default: 1,
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
        tag: "li",
        getAttrs: (element) => {
          if (element.parentElement?.tagName === "OL") {
            // Infer counter from its index in the parent.
            // For normal edits, counter is set by the postprocessor-plugin,
            // but that doesn't work for the initial content.
            const indexInParent = Array.from(element.parentElement.children)
              .filter((child) => child.tagName === "LI")
              .indexOf(element);
            const counter = indexInParent + 1;

            return {
              indent: indentAttr(computeIndent(element)),
              counter,
            };
          } else {
            // Fall through to unordered or task list (if installed).
            return false;
          }
        },
        contentElement: (element: HTMLElement) => {
          replaceParagraphsWithBreaks(element);
          return element;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const listStyleType = this.options.getListStyleType(getIndent(node));
    return [
      "ol",
      {
        start: node.attrs.counter,
        // Apply styling inline since I'm not sure how to include a CSS class in a Tiptap extension.
        // If you add other attrs here that shouldn't appear in copied lists,
        // modify joinListElements to remove them too.
        style: `margin-bottom: 0; margin-left: ${
          20 * getIndent(node)
        }px; list-style-type: ${listStyleType};`,
      },
      [
        "li",
        {
          // For computeIndent and joinListElements.
          // Omitted when 0 (both treat a missing attr as 0).
          "data-list-indent": getIndent(node) || null,
        },
        0,
      ],
    ];
  },

  // List token parsing priority: ordered > task > unordered.
  markdownTokenName: "list",
  parseMarkdown(token, helpers) {
    // Fall through to task or unordered list (if installed).
    if (!token.ordered) return [];

    const nodes: JSONContent[] = [];
    // CommonMark: the first item's number starts the list and the rest are
    // disregarded, so a list written as repeated "1." numbers 1, 2, 3.
    let counter = Number(token.start) || 1;
    for (const item of token.items ?? []) {
      nodes.push(
        helpers.createNode(
          orderedNodeName,
          { counter },
          parseItemContent(item, helpers),
        ),
      );
      counter++;
      nodes.push(...parseNestedLists(item, helpers));
    }
    return nodes;
  },
  renderMarkdown: renderFlatListMarkdown,

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-7": () => this.editor.commands.toggleFlatListItem("ordered"),
    };
  },

  addInputRules() {
    return [
      // Convert "1. " to an ordered list item if not already.
      flatListTypeInputRule({
        find: /^\s?(\d+)\.\s$/,
        type: this.type,
      }),
    ];
  },
});
