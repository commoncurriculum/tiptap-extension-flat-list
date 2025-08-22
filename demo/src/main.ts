import "./style.css";

import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

new Editor({
  element: document.querySelector(".element"),
  extensions: [Document, Paragraph, Text],
  content: "<p>Hello World!</p>",
});
