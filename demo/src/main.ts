import "./style.css";

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import {
  FlatListCore,
  FlatListOrdered,
  FlatListTask,
  FlatListUnordered,
  JoinListDOMSerializer,
} from "../../src/";

const editor = new Editor({
  element: document.querySelector(".element"),
  extensions: [
    Document,
    Paragraph,
    Text,
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
