import "./style.css";

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import {
  FlatListCore,
  FlatListOrdered,
  FlatListTask,
  FlatListUnordered,
  JoinListDOMSerializer,
} from "../../src/";

// Setup editor

const editor = new Editor({
  element: document.querySelector(".element"),
  extensions: [
    Document,
    Paragraph,
    Text,
    HardBreak,
    FlatListCore,
    FlatListOrdered,
    FlatListUnordered,
    FlatListTask,
  ],
  content: "<p>Hello World!</p>",
});

JoinListDOMSerializer.setClipboardSerializer(editor);

// To get HTML that uses normal HTML lists, instead of editor.getHTML(), call:
// JoinListDOMSerializer.getHTML(editor);

// Setup buttons

document.getElementById("ordered")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("flatListItemOrdered").run();
document.getElementById("unordered")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("flatListItemUnordered").run();
document.getElementById("task")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("flatListItemTask").run();
document.getElementById("indent")!.onclick = () =>
  editor.chain().focus().indentFlatListItem().run();
document.getElementById("dedent")!.onclick = () =>
  editor.chain().focus().dedentFlatListItem().run();
