import { InputRule, InputRuleFinder } from "@tiptap/core";
import { NodeType, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { FlatListType, isFlatListType } from "../list-type";

/**
 * Returns a flat list node's indent level.
 *
 * The indent attr is stored as undefined when it is 0 (the default), so that it
 * is omitted from the doc's JSON.
 */
export function getIndent(node: ProseMirrorNode): number {
  return (node.attrs["indent"] as number | undefined) ?? 0;
}

/**
 * Converts an indent level to its stored attr value: undefined for 0 (the default),
 * so that it is omitted from the doc's JSON.
 */
export function indentAttr(indent: number | undefined): number | undefined {
  if (indent === undefined) return undefined;
  if (indent < 0) {
    throw new Error("Invalid indent: " + indent);
  }
  return indent === 0 ? undefined : indent;
}

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
  listType: FlatListType,
  li: HTMLElement,
): HTMLElement {
  if (
    listType === "flatListItemTask" &&
    li.firstElementChild instanceof HTMLLabelElement &&
    li.lastElementChild instanceof HTMLElement
  ) {
    return li.lastElementChild;
  } else return li;
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
      if (isFlatListType(curNode.type.name)) {
        // Already a list node.
        if (curNode.type === config.type) {
          // Already the intended type. Don't disappear the input.
          return null;
        }
        // Preserve indent.
        indent = getIndent(curNode);
      }

      let checked: boolean | undefined = undefined;
      if (config.type.name === "flatListItemTask") {
        checked = match[match.length - 1]?.toLowerCase() === "x";
      }

      state.tr
        .delete(range.from, range.to)
        .setBlockType(range.from, range.from, config.type, {
          indent: indentAttr(indent),
          checked,
        });
      return;
    },
  });
}
