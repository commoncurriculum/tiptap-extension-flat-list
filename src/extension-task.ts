import { Node } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { taskNodeName } from "./internal/extension-names"
import {
  computeChecked,
  computeIndent,
  flatListTypeInputRule,
  getContentElement,
  hasNoContentBeforeChildList,
  replaceParagraphsWithBreaks,
} from "./internal/utils"

// Based on https://github.com/ueberdosis/tiptap/blob/main/packages/extension-task-item/src/task-item.ts
// In particular, its custom NodeView.

export interface FlatListTaskOptions {
  /**
   * Accessibility options for the task item.
   * @default {}
   * @example
   * ```js
   * {
   *   checkboxLabel: (node) => `Task item: ${node.textContent || 'empty task item'}`
   * }
   */
  a11y?: {
    checkboxLabel?: (node: ProseMirrorNode, checked: boolean) => string
  }
}

/**
 * Flat list extension that adds task flat list items (analog of `<ul><li>...</li></ul>`).
 *
 * If you use this extension, you must also use the FlatListCore extension.
 */
export const FlatListTask = Node.create<FlatListTaskOptions>({
  name: taskNodeName,

  group: "block",

  content: "inline*",

  priority: 220,

  defining: true,

  addOptions() {
    return {
      a11y: undefined,
    }
  },

  addAttributes() {
    return {
      indent: {
        default: 0,
        rendered: false,
      },
      checked: {
        default: false,
        keepOnSplit: false,
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
          // Since there is not standard HTML for task lists, we only look for task lists rendered by ourselves.
          // These are marked with data-task-list on the wrapping UL.
          if (element.parentElement) {
            const attrTaskList = element.parentElement.getAttribute("data-task-list")
            if (attrTaskList === "" || attrTaskList === "true") {
              return {
                indent: computeIndent(element),
                checked: computeChecked(element),
                _isTempPropped: hasNoContentBeforeChildList(getContentElement("task", element)),
              }
            }
          }
          // Fall through to unordered list (if installed).
          return false
        },
        contentElement: (element: HTMLElement) => {
          let contentElement = getContentElement("task", element)
          replaceParagraphsWithBreaks(contentElement)
          if (hasNoContentBeforeChildList(contentElement)) {
            // ProseMirror will ignore such an LI and only parse its child list.
            // Avoid this by propping up the LI with a temporary `&nbsp;`, indicated by _isTempPropped: true.
            // Our plugins watch _isTempPropped and remove this temporary char.
            contentElement.prepend(document.createTextNode("\u00A0"))
          }
          return contentElement
        },
      },
    ]
  },

  renderHTML({ node }) {
    // Note: This is only used for external HTML (getHTML and copying),
    // and it is further modified by joinListElements (especially copying, which replaces
    // the checkbox with plain text "[ ]" or "[x]").
    // In Tiptap, our node view is used instead.
    // When changing: Keep renderHTML in sync with the node view's layout & styling!
    return [
      "ul",
      {
        "data-task-list": "",
        style: `margin-bottom: 0; margin-left: ${20 * node.attrs.indent}px; list-style-type: none;`,
      },
      // Layout is from https://github.com/ueberdosis/tiptap/blob/main/packages/extension-task-item/src/task-item.ts
      // Instead of using the flex-based example styles at https://tiptap.dev/docs/editor/extensions/nodes/task-item,
      // we use position: relative/absolute, to get the layout we want without letting the checkbox
      // increasing the LI's height.
      [
        "li",
        {
          // For computeIndent and joinListElements.
          "data-list-indent": node.attrs.indent,
          // For computeChecked.
          "data-checked": node.attrs.checked,
          style: "position: relative;",
        },
        [
          "label",
          // Empirically, top: 0 makes the checkbox look centered.
          // TODO: Find a general solution if this is only true for our specific line-height.
          { style: "position: absolute; left: -20px; top: 0; user-select: none;" },
          [
            "input",
            {
              type: "checkbox",
              // Prevent interaction since this is only for external HTML.
              disabled: true,
              checked: node.attrs.checked ? "checked" : null,
              ariaLabel: checkboxAriaLabel(this.options, node),
            },
          ],
          ["span"],
        ],
        // Our content element. Note that this is different from the other flat list items,
        // whose content elememt is the LI itself; see utils.ts#getContentElement.
        ["div", 0],
      ],
    ]
  },

  addNodeView() {
    // Return a NodeView (custom renderer) so that we can receive events from the checkbox.
    // The resulting HTML is the same as for renderHTML above except that the checkbox is enabled
    // and has cursor: pointer.
    // When changing: Keep renderHTML in sync with the node view's layout & styling!
    return ({ node, HTMLAttributes, getPos, editor }) => {
      // Based on node view in https://github.com/ueberdosis/tiptap/blob/main/packages/extension-task-item/src/task-item.ts

      // Create HTML elements and assign attributes.

      const ul = document.createElement("ul")
      ul.style.cssText = `margin-bottom: 0; margin-left: ${
        20 * node.attrs.indent
      }px; list-style-type: none;`
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        ul.setAttribute(key, value)
      })

      const li = document.createElement("li")
      li.setAttribute("data-list-indent", node.attrs.indent)
      li.setAttribute("data-checked", node.attrs.checked)
      li.style.cssText = "position: relative;"
      // Object.entries(this.options.HTMLAttributes).forEach(([key, value]) => {
      //   listItem.setAttribute(key, value)
      // })

      const label = document.createElement("label")
      label.contentEditable = "false"
      label.style.cssText = "position: absolute; left: -20px; top: 0; user-select: none;"

      const input = document.createElement("input")
      input.type = "checkbox"
      input.checked = node.attrs.checked
      input.style.cssText = "cursor: pointer;"
      input.ariaLabel = checkboxAriaLabel(this.options, node)

      const span = document.createElement("span")

      const div = document.createElement("div")

      // Add checkbox event handlers that update the Tiptap state.

      input.addEventListener("mousedown", (event) => event.preventDefault())
      input.addEventListener("change", (event) => {
        if (!editor.isEditable) {
          input.checked = !input.checked

          return
        }

        const { checked } = event.target as any

        if (editor.isEditable && typeof getPos === "function") {
          editor
            .chain()
            .focus(undefined, { scrollIntoView: false })
            .command(({ tr }) => {
              const position = getPos()

              if (typeof position !== "number") {
                return false
              }
              const currentNode = tr.doc.nodeAt(position)

              tr.setNodeMarkup(position, undefined, {
                ...currentNode?.attrs,
                checked,
              })

              return true
            })
            .run()
        }
      })

      // Assemble HTML bottom-up.

      label.append(input, span)
      li.append(label, div)
      ul.append(li)

      return {
        dom: ul,
        contentDOM: div,
        update: (updatedNode) => {
          if (updatedNode.type !== this.type) {
            return false
          }

          // Re-do all assignments above that are functions of the node attrs.
          ul.style.cssText = `margin-bottom: 0; margin-left: ${
            20 * updatedNode.attrs.indent
          }px; list-style-type: none;`
          li.setAttribute("data-list-indent", updatedNode.attrs.indent)
          li.setAttribute("data-checked", updatedNode.attrs.checked)
          input.checked = updatedNode.attrs.checked
          input.ariaLabel = checkboxAriaLabel(this.options, updatedNode)

          return true
        },
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-9": () => this.editor.commands.toggleFlatListItem("task"),
    }
  },

  addInputRules() {
    return [
      // Convert "- [ ]" or "- [x]" to a task list item if not already.
      // Regex from https://github.com/ueberdosis/tiptap/blob/main/packages/extension-task-item/src/task-item.ts
      flatListTypeInputRule({
        find: /^\s*(\[([( |x])?\])\s$/i,
        type: this.type,
      }),
    ]
  },
})

function checkboxAriaLabel(options: FlatListTaskOptions, node: ProseMirrorNode): string {
  return (
    options.a11y?.checkboxLabel?.(node, !!node.attrs.checked) ||
    `Task item checkbox for ${node.textContent || "empty task item"}`
  )
}
