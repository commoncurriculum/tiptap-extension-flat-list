import { InputRule, InputRuleFinder } from "@tiptap/core";
import { NodeType, type TagParseRule } from "@tiptap/pm/model";
import { isFlatListNode, ListType } from "../list-type";
import {
  orderedNodeName,
  taskNodeName,
  unorderedNodeName,
} from "./extension-names";

/**
 * Computes the indent level of an `<li>`.
 * - If it's our own rendered `<li>`, use the data-list-indent attr.
 * - Else (e.g. pasted content) check the nesting level.
 */
export function computeIndent(element: HTMLElement) {
  const storedIndent = parseIntegerAttr(
    element.getAttribute("data-list-indent"),
  );
  if (storedIndent !== undefined) return storedIndent;

  // Count the number of ancestor ol/ul elements.
  let count = -1;
  for (
    let ancestor = element.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    if (ancestor.tagName === "UL" || ancestor.tagName === "OL") count++;
  }
  return Math.max(count, 0);
}

export function computeChecked(element: HTMLElement) {
  return (
    element.hasAttribute("data-checked") &&
    element.getAttribute("data-checked") !== "false"
  );
}

export function parseIntegerAttr(attr: string | null): number | undefined {
  if (attr === null) return undefined;
  const indent = Number.parseInt(attr);
  if (!Number.isInteger(indent)) return undefined;
  return indent;
}

/**
 * Given an LI output by one of our renderHTML() functions or joinListElement, returns its content element (the element containing the 0 in renderHTML).
 * - For ordered and unordered list items, the LI itself.
 * - For task list items that are shaped like a renderHTML output, the div that is the last child of the LI;
 * else the LI itself. (Latter happens when it's copied content that got simplified by joinListElements.)
 */
export function getContentElement(
  listType: ListType,
  li: HTMLElement,
): HTMLElement {
  if (
    listType === "task" &&
    li.firstElementChild instanceof HTMLLabelElement &&
    li.lastElementChild instanceof HTMLElement
  ) {
    return li.lastElementChild;
  } else return li;
}

/**
 * Attr for the marker element inserted by markChildListForClose.
 */
const closeMarkerAttr = "data-flat-list-close";

/**
 * Parse rule that closes the current flat list item when it encounters a marker
 * inserted by markChildListForClose, without outputting anything.
 *
 * Include this in the parseHTML() rules of every flat list node.
 */
export const closeMarkerParseRule = {
  tag: `span[${closeMarkerAttr}]`,
  closeParent: true,
  // Only close the parent if it is actually a flat list item.
  context: [orderedNodeName, unorderedNodeName, taskNodeName]
    .map((name) => name + "/")
    .join("|"),
} satisfies TagParseRule;

/**
 * If the given LI content element has a child list with no non-collapsible content beforehand,
 * inserts a marker element just before that list (modifying element in-place).
 *
 * Without this, prosemirror-model < 1.25.1 ignores such an LI and only parses its child list:
 * ProseMirror only closes the (still-empty) flat list item when the child list starts
 * if the item has inline content, and the child list's LIs can't be placed inside it.
 * The marker is parsed by closeMarkerParseRule, which closes the item explicitly.
 */
export function markChildListForClose(contentElement: HTMLElement): void {
  let childToCheck = contentElement.firstChild;
  if (
    (childToCheck instanceof Text &&
      // eslint-disable-next-line no-control-regex
      /^[ \t\r\n\u000c]*$/.test(childToCheck.wholeText)) ||
    childToCheck instanceof HTMLBRElement
  ) {
    // The first child is collapsible whitespace; skip.
    // The regex is from https://github.com/ProseMirror/prosemirror-model/blob/20d26c9843d6a69a1d417d937c401537ee0b2342/src/from_dom.ts#L443.
    // We also count BRs as collapsible in case they come from extension-external-trailing-break
    // (hence will be ignored during parsing).
    // Note that we insert the marker after the BR, so if the BR is instead parsed as a hard break,
    // the marker just closes the item slightly earlier than the child list would have.
    childToCheck = childToCheck.nextSibling;
  }

  if (
    childToCheck instanceof HTMLElement &&
    (childToCheck.tagName === "UL" || childToCheck.tagName === "OL")
  ) {
    const marker = contentElement.ownerDocument.createElement("span");
    marker.setAttribute(closeMarkerAttr, "");
    contentElement.insertBefore(marker, childToCheck);
  }
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
  let hasPChild = false;
  for (const child of element.children) {
    if (child.tagName === "P") {
      hasPChild = true;
      break;
    }
  }
  if (!hasPChild) return;

  // Replace each paragraph with its content, followed by a BR if needed to show a break.
  const originalChildNodes = Array.from(element.childNodes);
  for (let i = 0; i < originalChildNodes.length; i++) {
    const child = originalChildNodes[i];
    if (!(child instanceof HTMLElement && child.tagName === "P")) continue;

    // Move the paragraph's content to the parent
    const grandchildren = Array.from(child.childNodes);
    for (const grandchild of grandchildren) {
      element.insertBefore(grandchild, child);
    }
    // Add a BR after the paragraph content if needed to look right
    if (i < originalChildNodes.length - 1) {
      const nextChild = originalChildNodes[i + 1];
      if (
        nextChild instanceof HTMLElement &&
        ["OL", "UL", "LI"].includes(nextChild.tagName)
      ) {
        // nextChild will be parsed as a separate flat-list-item by ProseMirror.
        // Although adding a BR looks right in plain HTML, ProseMirror will interpret it as
        // an extra blank line in the current flat-list-item, which we don't want.
      } else {
        const br = element.ownerDocument.createElement("br");
        element.insertBefore(br, child);
      }
    }
    // Remove the now-empty paragraph
    element.removeChild(child);
  }

  return;
}

/**
 * Input rule to turn a block into a flat list item.
 *
 * This is based off of Tiptap's textblockTypeInputRule, with changes:
 * 1. We preserve the indent attr if the blocks starts as a list node.
 * 2. We don't match if the list node already has the intended type.
 * That way, you can type "1." at the start of an ordered list node without it disappearing.
 */
export function flatListTypeInputRule(config: {
  find: InputRuleFinder;
  type: NodeType;
}) {
  return new InputRule({
    find: config.find,
    handler: ({ state, range, match }) => {
      const $start = state.doc.resolve(range.from);
      if (
        !$start
          .node(-1)
          .canReplaceWith($start.index(-1), $start.indexAfter(-1), config.type)
      ) {
        return null;
      }

      let indent = 0;
      const curNode = $start.node($start.depth);
      if (isFlatListNode(curNode)) {
        // Already a list node.
        if (curNode.type === config.type) {
          // Already the intended type. Don't disappear the input.
          return null;
        }
        // Preserve indent.
        indent = curNode.attrs["indent"] ?? 0;
      }

      let checked: boolean | undefined = undefined;
      if (config.type.name === taskNodeName) {
        checked = match[match.length - 1]?.toLowerCase() === "x";
      }

      state.tr
        .delete(range.from, range.to)
        .setBlockType(range.from, range.from, config.type, { indent, checked });
      return;
    },
  });
}
