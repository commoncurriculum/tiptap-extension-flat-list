import { Plugin } from "@tiptap/pm/state"
import { isFlatListNode } from "../list-type"
import { orderedNodeName } from "./extension-names"

// TODO: In case collaboration leads to invalid indent states,
// also loop over indent levels in this plugin.

/**
 * ProseMirror plugin that post-processes flat list items after any changes to the document.
 *
 * 1. Sets `counter` attribute on each FlatListOrdered node.
 * 2. Processes _isTempPropped indicators, resetting them and removing the propping chars.
 */
export function flatListPostprocessorPlugin() {
  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      let tr = newState.tr
      let updated = false

      // Store the last counter values for each indent level.
      let lastCounters: number[] = []
      // Positions to delete according to _isTempPropped.
      const toDelete: number[] = []

      // Iterate over all children of doc.
      newState.doc.descendants((node, pos) => {
        if (isFlatListNode(node)) {
          let nodeAttrs = node.attrs

          // Indents.
          const indent = nodeAttrs.indent as number
          if (node.type.name === orderedNodeName) {
            const counterValue = (lastCounters[indent] ?? 0) + 1

            // If the node’s current counter attribute doesn't match the computed value, update it.
            if (nodeAttrs.counter !== counterValue) {
              nodeAttrs = { ...nodeAttrs, counter: counterValue }
              tr = tr.setNodeMarkup(pos, undefined, nodeAttrs)
              updated = true
            }

            // Update the counter value for this indent level.
            lastCounters[indent] = counterValue
            // Reset the counter value for higher indent levels.
            lastCounters.length = indent + 1
          } else {
            // Non-ordered list block. Reset the counter value for this and higher indent levels.
            lastCounters.length = indent
          }

          // Temp prop handling: record propping char for deletion and reset _isTempPropped.
          if (nodeAttrs._isTempPropped) {
            nodeAttrs = { ...nodeAttrs, _isTempPropped: undefined }
            tr = tr.setNodeMarkup(pos, undefined, nodeAttrs)
            toDelete.push(pos + 1)
            updated = true
          }
        } else {
          // Not a list block. Reset all counters.
          lastCounters = []
        }

        return false
      })

      if (toDelete.length > 0) {
        // Delete in reverse order so we don't need to transform positions.
        toDelete.reverse()
        for (const pos of toDelete) tr.delete(pos, pos + 1)
        updated = true
      }

      // If any node was updated, apply the transaction.
      if (updated) {
        // We need to restore the storedMarks per https://discuss.prosemirror.net/t/does-tr-setnodeattribute-reset-stored-marks/6147
        // Otherwise hitting enter after an ordered list item loses them.
        tr.setStoredMarks(newState.storedMarks)
        tr.setMeta("addToHistory", false)
        return tr
      } else {
        return null
      }
    },
  })
}
