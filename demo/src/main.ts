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

// To get HTML that has normal HTML lists:
//   JoinListDOMSerializer.getHTML(editor);
// instead of editor.getHTML().

// Setup buttons

document.getElementById("ordered")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("ordered").run();
document.getElementById("unordered")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("unordered").run();
document.getElementById("task")!.onclick = () =>
  editor.chain().focus().toggleFlatListItem("task").run();
document.getElementById("indent")!.onclick = () =>
  editor.chain().focus().indentFlatListItem().run();
document.getElementById("dedent")!.onclick = () =>
  editor.chain().focus().dedentFlatListItem().run();
