import { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { isFlatListNode } from "../list-type";
import { orderedNodeName } from "./extension-names";
import { getIndent } from "./utils";

// TODO: In case collaboration leads to invalid indent states,
// also loop over indent levels in this plugin.

/**
 * ProseMirror plugin that post-processes flat list items after any changes to the document.
 *
 * Sets `counter` attribute on each FlatListOrdered node.
 */
export function flatListPostprocessorPlugin() {
  return new Plugin({
    key: new PluginKey("flatListPostprocessorPlugin"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      let tr = newState.tr;
      let updated = false;

      // Store the last counter values for each parent node and indent level.
      const lastCounters = new Map<PMNode | null, number[]>();

      newState.doc.descendants((node, pos, parent) => {
        if (isFlatListNode(node)) {
          let parentLastCounters = lastCounters.get(parent);
          if (!parentLastCounters) {
            parentLastCounters = [];
            lastCounters.set(parent, parentLastCounters);
          }

          let nodeAttrs = node.attrs;

          // Indents.
          const indent = getIndent(node);
          if (node.type.name === orderedNodeName) {
            const counterValue = (parentLastCounters[indent] ?? 0) + 1;

            // If the node’s current counter attribute doesn't match the computed value, update it.
            if (nodeAttrs.counter !== counterValue) {
              nodeAttrs = { ...nodeAttrs, counter: counterValue };
              tr = tr.setNodeMarkup(pos, undefined, nodeAttrs);
              updated = true;
            }

            // Update the counter value for this indent level.
            parentLastCounters[indent] = counterValue;
            // Reset the counter value for higher indent levels.
            parentLastCounters.length = indent + 1;
          } else {
            // Non-ordered list block. Reset the counter value for this and higher indent levels.
            parentLastCounters.length = indent;
          }
        } else {
          // Not a list block. Reset all counters.
          lastCounters.delete(parent);
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
