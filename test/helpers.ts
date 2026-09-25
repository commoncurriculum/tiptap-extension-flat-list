// Must come first: installs the jsdom globals that Tiptap needs.
import "./setup";

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  FlatListCore,
  FlatListOrdered,
  FlatListTask,
  FlatListUnordered,
  type FlatListTaskOptions,
} from "../src/index";
import { isFlatListType, type FlatListType } from "../src/list-type";

/**
 * Creates an Editor with all flat list extensions, attached to a fresh jsdom element.
 */
export function createEditor(
  content?: string,
  taskOptions?: Partial<FlatListTaskOptions>,
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      FlatListCore,
      FlatListOrdered,
      FlatListUnordered,
      taskOptions ? FlatListTask.configure(taskOptions) : FlatListTask,
    ],
    ...(content === undefined ? {} : { content }),
  });
}

/**
 * A summary of a top-level block, convenient for assertions.
 *
 * Example: `{ type: "flatListItemOrdered", indent: 1, counter: 2, text: "foo" }`.
 */
export interface BlockSummary {
  type: FlatListType | "paragraph";
  text: string;
  indent?: number;
  counter?: number;
  checked?: boolean;
}

export function summarizeDoc(doc: ProseMirrorNode): BlockSummary[] {
  const summaries: BlockSummary[] = [];
  doc.forEach((node) => {
    const listType = node.type.name;
    if (!isFlatListType(listType)) {
      summaries.push({ type: "paragraph", text: node.textContent });
    } else {
      const summary: BlockSummary = {
        type: listType,
        text: node.textContent,
        indent: node.attrs.indent ?? 0,
      };
      if (listType === "flatListItemOrdered")
        summary.counter = node.attrs.counter;
      if (listType === "flatListItemTask")
        summary.checked = !!node.attrs.checked;
      summaries.push(summary);
    }
  });
  return summaries;
}

export function summarize(editor: Editor): BlockSummary[] {
  return summarizeDoc(editor.state.doc);
}

/**
 * Places the cursor inside the block at the given top-level index,
 * at `offset` characters into it (default: the end of the block).
 */
export function setCursorIn(editor: Editor, index: number, offset?: number) {
  const doc = editor.state.doc;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const block = doc.child(index);
  // +1 to get inside the block.
  editor.commands.setTextSelection(pos + 1 + (offset ?? block.content.size));
}
