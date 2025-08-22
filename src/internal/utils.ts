import { InputRule, InputRuleFinder } from "@tiptap/core"
import { NodeType } from "@tiptap/pm/model"
import { isFlatListNode, ListType } from "../list-type"
import { taskNodeName } from "./extension-names"

/**
 * Computes the indent level of an `<li>`.
 * - If it's our own rendered `<li>`, use the data-list-indent attr.
 * - Else (e.g. pasted content) check the nesting level.
 */
export function computeIndent(element: HTMLElement) {
  const storedIndent = parseIntegerAttr(element.getAttribute("data-list-indent"))
  if (storedIndent !== undefined) return storedIndent

  // Count the number of ancestor ol/ul elements.
  let count = -1
  for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
    if (ancestor.tagName === "UL" || ancestor.tagName === "OL") count++
  }
  return Math.max(count, 0)
}

export function computeChecked(element: HTMLElement) {
  const dataChecked = element.getAttribute("data-checked")

  return dataChecked === "" || dataChecked === "true"
}

export function parseIntegerAttr(attr: string | null): number | undefined {
  if (attr === null) return undefined
  const indent = Number.parseInt(attr)
  if (!Number.isInteger(indent)) return undefined
  return indent
}

/**
 * Given an LI output by one of our renderHTML() functions or joinListElement, returns its content element (the element containing the 0 in renderHTML).
 * - For ordered and unordered list items, the LI itself.
 * - For task list items that are shaped like a renderHTML output, the div that is the last child of the LI;
 * else the LI itself. (Latter happens when it's copied content that got simplified by joinListElements.)
 */
export function getContentElement(listType: ListType, li: HTMLElement): HTMLElement {
  if (
    listType === "task" &&
    li.firstElementChild instanceof HTMLLabelElement &&
    li.lastElementChild instanceof HTMLElement
  ) {
    return li.lastElementChild
  } else return li
}

/**
 * Whether the given element has a child list with no non-collapsible content beforehand.
 * These need special handling in parseHTML to prevent ProseMirror from ignoring the LI
 * and just parsing its child list.
 */
export function hasNoContentBeforeChildList(contentElement: HTMLElement): boolean {
  // If an li contains a nested list but no (non-collapsible) leading content,
  // ProseMirror will parse the whole thing as one flat list node.
  // Prevent this by propping it up with a leading `&nbsp;`, later removed by
  // flatListPostprocessorPlugin or pastePlugin.
  let childToCheck = contentElement.firstChild
  if (
    // eslint-disable-next-line no-control-regex
    (childToCheck instanceof Text && /^[ \t\r\n\u000c]*$/.test(childToCheck.wholeText)) ||
    childToCheck instanceof HTMLBRElement
  ) {
    // The first child is collapsible whitespace; skip.
    // The regex is from https://github.com/ProseMirror/prosemirror-model/blob/20d26c9843d6a69a1d417d937c401537ee0b2342/src/from_dom.ts#L443.
    // We also count BRs as collapsible in case they come from extension-external-trailing-break
    // (hence will be ignored during parsing).
    childToCheck = contentElement.childNodes.item(1)
  }

  return (
    childToCheck instanceof HTMLElement &&
    (childToCheck.tagName === "UL" || childToCheck.tagName === "OL")
  )
}

/**
 * If element contains paragraphs, replaces them with their content separated by BRs
 * (modifying element in-place).
 *
 * In particular, if the element contains a single paragraph, that paragraph is replaced with its content.
 *
 * This is used to handle the case of an LI with paragraphs inside of it - common in generated HTML
 * (e.g. from Tiptap's built-in list extensions or Ckeditor).
 * Even a single paragraph causes issues after
 * https://github.com/ProseMirror/prosemirror-model/commit/cfd749b32aa6409617a3513c829e46012f4869fa:
 * it's moved out of the list-item for failing to conform to the schema.
 */
export function replaceParagraphsWithBreaks(element: HTMLElement): void {
  let hasPChild = false
  for (const child of element.children) {
    if (child.tagName === "P") {
      hasPChild = true
      break
    }
  }
  if (!hasPChild) return

  // Replace each paragraph with its content, followed by a BR if needed to show a break.
  const originalChildNodes = Array.from(element.childNodes)
  for (let i = 0; i < originalChildNodes.length; i++) {
    const child = originalChildNodes[i]
    if (!(child instanceof HTMLElement && child.tagName === "P")) continue

    // Move the paragraph's content to the parent
    const grandchildren = Array.from(child.childNodes)
    for (const grandchild of grandchildren) {
      element.insertBefore(grandchild, child)
    }
    // Add a BR after the paragraph content if needed to look right
    if (i < originalChildNodes.length - 1) {
      const nextChild = originalChildNodes[i + 1]
      if (nextChild instanceof HTMLElement && ["OL", "UL", "LI"].includes(nextChild.tagName)) {
        // nextChild will be parsed as a separate flat-list-item by ProseMirror.
        // Although adding a BR looks right in plain HTML, ProseMirror will interpret it as
        // an extra blank line in the current flat-list-item, which we don't want.
      } else {
        const br = element.ownerDocument.createElement("br")
        element.insertBefore(br, child)
      }
    }
    // Remove the now-empty paragraph
    element.removeChild(child)
  }

  return
}

/**
 * Input rule to turn a block into a flat list item.
 *
 * This is based off of Tiptap's textblockTypeInputRule, with changes:
 * 1. We preserve the indent attr if the blocks starts as a list node.
 * 2. We don't match if the list node already has the intended type.
 * That way, you can type "1." at the start of an ordered list node without it disappearing.
 */
export function flatListTypeInputRule(config: { find: InputRuleFinder; type: NodeType }) {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const $start = state.doc.resolve(range.from)
      if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), config.type)) {
        return null
      }

      let indent = 0
      const curNode = $start.node($start.depth)
      if (isFlatListNode(curNode)) {
        // Already a list node.
        if (curNode.type === config.type) {
          // Already the intended type. Don't disappear the input.
          return null
        }
        // Preserve indent.
        indent = curNode.attrs["indent"] ?? 0
      }

      let checked: boolean | undefined = undefined
      if (config.type.name === taskNodeName) {
        checked = match[match.length - 1]?.toLowerCase() === "x"
      }

      state.tr
        .delete(range.from, range.to)
        .setBlockType(range.from, range.from, config.type, { indent, checked })
      return
    },
  })
}
