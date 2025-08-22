import { Editor, Extension, getNodeType, isNodeActive } from "@tiptap/core";
import { setBlockType } from "@tiptap/pm/commands";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { taskNodeName } from "./internal/extension-names";
import { flatListPastePlugin } from "./internal/paste-plugin";
import { flatListPostprocessorPlugin } from "./internal/postprocessor-plugin";
import { getFlatListNodeName, isFlatListNode, ListType } from "./list-type";

// Based on https://github.com/ocavue/prosemirror-flat-list
// and https://github.com/ueberdosis/tiptap/blob/main/packages/extension-heading/src/heading.ts

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    flatList: {
      /**
       * Sets a flat list item node.
       *
       * If `attributes.indent` is not provided and any selected nodes are already flat list nodes
       * (possibly a different ListType), their indent is preserved.
       *
       * @param listType The list type: "ordered" | "unordered" | "task"
       * @param attributes The node attributes
       * @example editor.commands.setFlatList("unordered", { indent: 1 })
       */
      setFlatListItem: (
        listType: ListType,
        attributes?: { indent?: number; checked?: boolean },
      ) => ReturnType;
      /**
       * Toggles a flat list item node.
       *
       * When toggling on,
       * if `attributes.indent` is not provided and any selected nodes are already flat list nodes
       * (possibly a different ListType), their indent is preserved.
       *
       * @param listType The list type: "ordered" | "unordered" | "task"
       * @param attributes The node attributes
       * @example editor.commands.toggleFlatList("ordered")
       */
      toggleFlatListItem: (
        listType: ListType,
        attributes?: { indent?: number; checked?: boolean },
      ) => ReturnType;
      /**
       * Indents the flat list item(s) overlapping the current selection.
       *
       * A list item can be indented at most as much as its "parent" (previous list item) plus 1.
       */
      indentFlatListItem: () => ReturnType;
      /**
       * Dedents (un-indent) the flat list item(s) overlapping the current selection.
       * If an affected item's indent is 0 and canConvert is true, the item is converted to a paragraph.
       *
       * This will also dedent all "descendants" of the last affected item (subsequent list items with greater indent).
       */
      dedentFlatListItem: (canConvert?: boolean) => ReturnType;
    };
  }
}

/**
 * Required core extension for flat lists.
 *
 * This extension adds commands, keyboard shortcuts, and plugins shared by all flat list extensions,
 * but does not the flat list items themselves.
 * For those, also add the extensions FlatListOrdered, FlatListUnordered, and/or FlatListTask.
 */
export const FlatListCore = Extension.create({
  name: "flatListCore",

  priority: 200,

  addCommands() {
    return {
      setFlatListItem:
        (listType, attributes = {}) =>
        // Tiptap command style: Return a function that makes your changes using the given `commands` object
        // (not editor.commands), or return false if this command is not applicable.
        // See https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing#commands
        ({ state, dispatch, chain }) => {
          // Copy of commands.setNode(getFlatListNodeName(listType), attributes)
          // except we pass attrsFn to setBlockType instead of attributes.

          const attrsFn = (oldNode: ProseMirrorNode): Record<string, any> => {
            if (isFlatListNode(oldNode)) {
              const newAttrs = { ...attributes };
              if (attributes.indent === undefined) {
                // Preserve indent.
                newAttrs.indent = oldNode.attrs.indent;
              }
              if (
                listType === "task" &&
                oldNode.type.name === taskNodeName &&
                attributes.checked === undefined
              ) {
                // Preserve checked.
                newAttrs.checked = oldNode.attrs.checked;
              }
              return newAttrs;
            } else return attributes;
          };

          const type = getNodeType(getFlatListNodeName(listType), state.schema);

          if (!type.isTextblock) {
            console.warn(
              '[tiptap warn]: Currently "setNode()" only supports text block nodes.',
            );

            return false;
          }

          return chain()
            .command(({ commands }) => {
              const canSetBlock = setBlockType(type, attrsFn)(state);

              if (canSetBlock) {
                return true;
              }

              return commands.clearNodes();
            })
            .command(({ state: updatedState }) => {
              return setBlockType(type, attrsFn)(updatedState, dispatch);
            })
            .run();
        },

      toggleFlatListItem:
        (listType, attributes) =>
        ({ state, commands }) => {
          // Copy of commands.toggleNode(getFlatListNodeName(listType), "paragraph", attributes)
          // except we change the last line from setNode to setFlatListItem.

          const type = getNodeType(getFlatListNodeName(listType), state.schema);
          const toggleType = getNodeType("paragraph", state.schema);
          const isActive = isNodeActive(state, type, attributes);

          let attributesToCopy: Record<string, any> | undefined;

          if (state.selection.$anchor.sameParent(state.selection.$head)) {
            attributesToCopy = state.selection.$anchor.parent.attrs;
          }

          if (isActive) {
            return commands.setNode(toggleType, attributesToCopy);
          }

          return commands.setFlatListItem(listType, {
            ...attributesToCopy,
            ...attributes,
          });
        },

      indentFlatListItem:
        () =>
        // ProseMirror command style: Return whether this command is applicable; if so and dispatch is provided,
        // call dispatch(tr) to actually do it.
        // See https://prosemirror.net/docs/guide/#commands (note that Tiptap adds tr = state.tr).
        ({ state, tr, dispatch }) => {
          // Based on ProseMirror's setBlockType command.
          let applicable = false;
          for (const range of state.selection.ranges) {
            const {
              $from: { pos: from },
              $to: { pos: to },
            } = range;
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (isFlatListNode(node)) {
                const newIndent = (node.attrs["indent"] ?? 0) + 1;
                // Only indent if it's at most one more than the previous list item
                // (accounting for tr's prior changes).
                const resolvedInTr = tr.doc.resolve(pos);
                const prevSiblingInTr = resolvedInTr.parent.childBefore(
                  resolvedInTr.parentOffset,
                ).node;
                const prevSiblingIndent =
                  prevSiblingInTr && isFlatListNode(prevSiblingInTr)
                    ? (prevSiblingInTr.attrs["indent"] ?? 0)
                    : -1;
                if (newIndent <= prevSiblingIndent + 1) {
                  applicable = true;
                  tr.setNodeAttribute(pos, "indent", newIndent);
                }
              }
            });
          }

          if (!applicable) return false;
          if (dispatch) dispatch(tr);
          return true;
        },

      dedentFlatListItem:
        (canConvert = false) =>
        ({ state, tr, dispatch }) => {
          // Based on ProseMirror's setBlockType command.
          let applicable = false;
          let lastDedented: {
            pos: number;
            oldIndent: number;
            node: ProseMirrorNode;
          } | null = null;
          for (const range of state.selection.ranges) {
            const {
              $from: { pos: from },
              $to: { pos: to },
            } = range;
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (isFlatListNode(node)) {
                const indent = node.attrs["indent"] ?? 0;
                if (indent > 0) {
                  applicable = true;
                  tr.setNodeAttribute(pos, "indent", indent - 1);
                } else if (canConvert) {
                  applicable = true;
                  tr.setNodeMarkup(pos, state.schema.nodes["paragraph"]);
                }

                if (applicable) {
                  lastDedented = { pos, oldIndent: indent, node };
                }
              }
            });
          }

          if (!applicable) return false;

          // Also dedent all "descendants" of the last affected item (subsequent list items with greater indent).
          const $lastDedented = tr.doc.resolve(lastDedented!.pos);
          let subsequentItemPos =
            lastDedented!.pos + lastDedented!.node.nodeSize;
          for (
            let index = $lastDedented.index() + 1;
            index < $lastDedented.parent.childCount;
            index++
          ) {
            const subsequentItem = $lastDedented.parent.child(index);
            if (!isFlatListNode(subsequentItem)) break;
            const indent = subsequentItem.attrs["indent"] ?? 0;
            if (indent <= lastDedented!.oldIndent) break;

            tr.setNodeAttribute(subsequentItemPos, "indent", indent - 1);

            subsequentItemPos += subsequentItem.nodeSize;
          }

          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => handleEnter(this.editor),
      Backspace: () => handleBackspace(this.editor),
      Delete: () => handleDelete(this.editor),
      Tab: () => this.editor.commands.indentFlatListItem(),
      "Shift-Tab": () => this.editor.commands.dedentFlatListItem(),
    };
  },

  addProseMirrorPlugins() {
    return [flatListPastePlugin(), flatListPostprocessorPlugin()];
  },
});

/**
 * Handle pressing enter when the cursor is at the start/end of a flat list item:
 * insert a similar flat list item before/after (like splitting), or dedent
 * the current item (possibly converting to paragraph) if the current item is empty.
 */
function handleEnter(editor: Editor): boolean {
  const { $to, $from, from, to } = editor.state.selection;
  const parentContentSize = $to.parent.nodeSize - 2;

  if (from !== to) return false;
  if (!isFlatListNode($to.parent)) return false;
  if (!($to.parentOffset === 0 || $to.parentOffset === parentContentSize))
    return false;

  if (parentContentSize === 0) {
    // Blank list item. Dedent, possibly converting to paragraph.
    return editor.commands.dedentFlatListItem(true);
  }

  // Create a new list item before/after the cursor with the same attrs
  // (like splitting, but splitBlock doesn't do it because our content is inline instead of block).
  const newItem = { type: $to.parent.type.name, attrs: $to.parent.attrs };
  let cmds = editor.chain();
  if ($to.parentOffset === 0) {
    cmds = cmds.insertContentAt(to - 1, newItem).setTextSelection(to + 2);
  } else {
    cmds = cmds.insertContent(newItem);
  }

  // Need extra effort to preserve marks. Based on impl of extension-hard-break's keepMarks option.
  const { splittableMarks } = editor.extensionManager;
  const marks = editor.state.storedMarks || ($to.parentOffset && $from.marks());
  return cmds
    .command(({ tr, dispatch }) => {
      if (dispatch && marks) {
        const filteredMarks = marks.filter((mark) =>
          splittableMarks.includes(mark.type.name),
        );
        tr.ensureMarks(filteredMarks);
      }
      return true;
    })
    .run();
}

function handleBackspace(editor: Editor): boolean {
  return (
    editor.commands.undoInputRule() ||
    handleBackspace1(editor) ||
    handleBackspace2(editor)
  );
}

/**
 * Handle pressing backspace when the cursor is at the start of a flat list item:
 * convert to a paragraph or dedent.
 *
 * Note: When applied to an indented list item, Notion and GDocs will instead
 * convert to a paragraph at the same indent level. However, we don't have indented paragraphs.
 */
function handleBackspace1(editor: Editor): boolean {
  const { $to, from, to } = editor.state.selection;

  if (from !== to) return false;
  if (!isFlatListNode($to.parent)) return false;
  if ($to.parentOffset !== 0) return false;

  // Cursor at the start of a flat list item.
  // Dedent, possibly converting to paragraph.
  return editor.commands.dedentFlatListItem(true);
}

/**
 * Handle pressing backspace when the cursor is at the start of a node after an empty
 * flat list item: merge that node into the list item, keeping the list item
 * (instead of turning it into a paragraph like the default behavior).
 */
function handleBackspace2(editor: Editor): boolean {
  const { $to, from, to } = editor.state.selection;

  if (from !== to) return false;
  if ($to.parentOffset !== 0) return false;
  if ($to.depth < 1) return false;

  const indexInGrandparent = $to.index(-1);
  if (indexInGrandparent === 0) return false;
  const grandparent = $to.node(-1);
  const prevNode = grandparent.child(indexInGrandparent - 1);
  if (!isFlatListNode(prevNode)) return false;
  if (prevNode.content.size !== 0) return false;

  // Cursor at the start of a node after an empty flat list item.
  // Merge that node into the list item, keeping the list item.
  return editor.commands.deleteRange({ from: from - 2, to: from });
}

/**
 * Delete-key version of handleBackspace2.
 *
 * Handle pressing delete when the cursor is in an empty flat list item:
 * merge the following node into the list item, keeping the list item
 * (instead of turning it into a paragraph like the default behavior).
 */
function handleDelete(editor: Editor): boolean {
  const { $to, from, to } = editor.state.selection;
  const parentContentSize = $to.parent.nodeSize - 2;

  if (from !== to) return false;
  if (!isFlatListNode($to.parent)) return false;
  if (parentContentSize !== 0) return false;

  const indexInGrandparent = $to.index(-1);
  const grandparent = $to.node(-1);
  if (indexInGrandparent === grandparent.childCount - 1) return false;

  // Cursor is in an empty flat list item and there exists a following node.
  // Merge that node into the list item, keeping the list item.
  return editor.commands.deleteRange({ from: from, to: from + 2 });
}
