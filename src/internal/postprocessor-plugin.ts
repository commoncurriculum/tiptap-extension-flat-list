import { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { isFlatListNode } from "../list-type";
import { orderedNodeName } from "./extension-names";
import { getIndent, indentAttr } from "./utils";

/**
 * ProseMirror plugin that post-processes flat list items after any changes to the document.
 *
 * 1. Sets the `counter` attribute on each FlatListOrdered node.
 * 2. Repairs indents so that each item is at most one deeper than the previous item.
 * (Our commands guarantee this already, but other changes might not - in particular, collaborative edits.)
 * Specifically, we act as if the previous item used to be the item's "parent"
 * (in the flat list) but was dedented by itself. We repair that by doing the rest of
 * dedentFlatListItem: dedent the item, its "siblings", and their
 * "descendants" by the same amount.
 */
export function flatListPostprocessorPlugin() {
  return new Plugin({
    key: new PluginKey("flatListPostprocessorPlugin"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr = newState.tr;
      let updated = false;

      // State for the current run of list items within each actual parent node.
      const parentStates = new Map<
        PMNode | null,
        {
          // Maps indent level -> last counter value.
          lastCounters: number[];
          // Stack of indent levels for the current item's "ancestors" (in the flat list)
          // plus its previous "sibling" if applicable.
          ancestors: { oldIndent: number; newIndent: number }[];
        }
      >();

      newState.doc.descendants((node, pos, parent) => {
        if (isFlatListNode(node)) {
          let parentState = parentStates.get(parent);
          if (!parentState) {
            parentState = { lastCounters: [], ancestors: [] };
            parentStates.set(parent, parentState);
          }
          const { lastCounters, ancestors } = parentState;

          const oldAttrs = node.attrs;
          let nodeAttrs = oldAttrs;

          // 1. Indents

          const oldIndent = getIndent(node);
          // At most one deeper than the previous item (-1 if none).
          const maxIndent = (ancestors.at(-1)?.newIndent ?? -1) + 1;
          // Pop items that are not our ancestors or previous sibling.
          while (
            ancestors.length > 0 &&
            ancestors.at(-1)!.oldIndent > oldIndent
          ) {
            ancestors.pop();
          }
          // Shift by the same amount as our parent or previous sibling.
          const top = ancestors.at(-1);
          const shift = top ? top.oldIndent - top.newIndent : 0;
          const indent = Math.max(0, Math.min(oldIndent - shift, maxIndent));
          // Store our indent for future nodes.
          if (top && top.oldIndent === oldIndent) {
            // Replace our previous sibling.
            ancestors.pop();
          }
          ancestors.push({ oldIndent, newIndent: indent });

          if (indent !== oldIndent) {
            nodeAttrs = { ...nodeAttrs, indent: indentAttr(indent) };
          }

          // 2. Counters

          if (node.type.name === orderedNodeName) {
            // indent is the *new* indent computed above.
            const counterValue = (lastCounters[indent] ?? 0) + 1;

            // If the node’s current counter attribute doesn't match the computed value, update it.
            if (nodeAttrs.counter !== counterValue) {
              nodeAttrs = { ...nodeAttrs, counter: counterValue };
            }

            // Update the counter value for this indent level.
            lastCounters[indent] = counterValue;
            // Reset the counter value for higher indent levels.
            lastCounters.length = indent + 1;
          } else {
            // Non-ordered list block. Reset the counter value for this and higher indent levels.
            lastCounters.length = indent;
          }

          if (nodeAttrs !== oldAttrs) {
            tr = tr.setNodeMarkup(pos, undefined, nodeAttrs);
            updated = true;
          }
        } else {
          // Not a list block. Reset all counters and indents.
          parentStates.delete(parent);
        }

        // Recurse into nodes that could have flat-list-item descendants.
        return !node.inlineContent;
      });

      // If any node was updated, apply the transaction.
      if (updated) {
        // We need to restore the storedMarks per https://discuss.prosemirror.net/t/does-tr-setnodeattribute-reset-stored-marks/6147
        // Otherwise hitting enter after an ordered list item loses them.
        tr.setStoredMarks(newState.storedMarks);
        tr.setMeta("addToHistory", false);
        return tr;
      } else {
        return null;
      }
    },
  });
}
