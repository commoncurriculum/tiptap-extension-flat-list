import { Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { isFlatListNode } from "../list-type";

/**
 * ProseMirror plugin that massages pasted list items.
 *
 * 1. Sets indent levels, following these rules (matching Notion's apparent behavior):
 *   - The first pasted list item matches the indent level of the previous node in the document
 * (or 0 if that node is not a list item).
 *   - Subsequent pasted list items preserve their indent relative to their predecessor,
 * clamped to [0, predecessor + 1].
 * 2. Processes _isTempPropped indicator for the first node, resetting it and removing the propping char.
 * (We can't rely on flatListPostprocessorPlugin because the first node might be merged
 * into the paste target, forgetting _isTempPropped.)
 */
export function flatListPastePlugin() {
  return new Plugin({
    props: {
      transformPasted(slice, view) {
        // 1. Set indent levels.

        // Find the previous node in the document relative to the paste position.
        const from = view.state.selection.$from;
        let contextIndent = 0;
        let lastIndent = -1;
        if (from.depth > 0 && isFlatListNode(from.node(1))) {
          contextIndent = from.node(1).attrs.indent;
          lastIndent = from.node(1).attrs.indent;
        }

        // Loop over top-level nodes in the slice, setting the indent on list items.
        // delta is the amount to add to the next node's indent level, or null if reset.
        let delta: number | null = null;
        for (let i = 0; i < slice.content.childCount; i++) {
          const child = slice.content.child(i);
          if (isFlatListNode(child)) {
            if (delta === null) {
              // Start a new list, with this node at indent = contextIndent.
              delta = contextIndent - child.attrs.indent;
            }

            if (i === 0) {
              // The first node usally inherits the type and indent of the node containing the paste target,
              // so child.attrs.indent will be discarded and we should leave lastIndent alone.
              // Exception: if you paste at the very beginning of a node, then that node's type
              // is overwritten by the first pasted node (= child), so we should proceed.
              if (
                !(
                  from.depth > 0 &&
                  from.pos == from.posAtIndex(from.index(0), 0) + 1
                )
              )
                continue;
            }

            let newIndent = child.attrs.indent + delta;

            // Clamp newIndent, also adjusting following indents by the same amount.
            if (newIndent < 0) {
              delta += 0 - newIndent;
              newIndent = 0;
            } else if (newIndent > lastIndent + 1) {
              delta += lastIndent + 1 - newIndent;
              newIndent = lastIndent + 1;
            }
            lastIndent = newIndent;

            // Update child in the slice.
            // @ts-expect-error Mutating directly for convenience.
            child.attrs.indent = newIndent;
            // slice = new Slice(
            //   slice.content.replaceChild(
            //     i,
            //     child.type.create({ ...child.attrs, indent: newIndent }, child)
            //   ),
            //   slice.openStart,
            //   slice.openEnd
            // )
          } else {
            // Reset list.
            contextIndent = 0;
            delta = null;
          }
        }

        // 2. Process _isTempPropped indicator for the first node.
        const firstChild = slice.content.firstChild;
        if (
          firstChild &&
          isFlatListNode(firstChild) &&
          firstChild.attrs._isTempPropped
        ) {
          // Reset indicator and delete propping char.
          const newFirstChild = firstChild.type.create(
            { ...firstChild.attrs, _isTempPropped: undefined },
            firstChild.content.cut(1),
          );
          slice = new Slice(
            slice.content.replaceChild(0, newFirstChild),
            slice.openStart,
            slice.openEnd,
          );
        }

        return slice;
      },
    },
  });
}
