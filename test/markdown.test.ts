// Must come first: installs the jsdom globals that Tiptap needs.
import "./setup";

import { assert } from "chai";
import { Editor, type AnyExtension } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Markdown } from "@tiptap/markdown";
import {
  FlatListCore,
  FlatListOrdered,
  FlatListTask,
  FlatListUnordered,
} from "../src/index";
import { summarize } from "./helpers";

const allLists = [FlatListOrdered, FlatListTask, FlatListUnordered];

function createMarkdownEditor(
  content: string,
  lists: AnyExtension[] = allLists,
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
      Markdown,
      FlatListCore,
      ...lists,
    ],
    content,
    contentType: "markdown",
  });
}

describe("Markdown", () => {
  let editor: Editor;

  afterEach(() => editor.destroy());

  describe("parse", () => {
    it("parses each list type", () => {
      editor = createMarkdownEditor("- a\n\n1. b\n2. c\n\n- [ ] d\n- [x] e\n");
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "ordered", text: "b", indent: 0, counter: 1 },
        { type: "ordered", text: "c", indent: 0, counter: 2 },
        { type: "task", text: "d", indent: 0, checked: false },
        { type: "task", text: "e", indent: 0, checked: true },
      ]);
    });

    it("numbers ordered lists from 1, ignoring the start number", () => {
      // Only lists that start from 1 are supported, matching the postprocessor.
      editor = createMarkdownEditor("3. a\n4. b\n    7. c\n");
      assert.deepEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 0, counter: 2 },
        { type: "ordered", text: "c", indent: 1, counter: 1 },
      ]);
    });

    it("parses nested lists of mixed types as indents", () => {
      editor = createMarkdownEditor(
        "- a\n    1. b\n        - [x] c\n    1. d\n- e\n",
      );
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "ordered", text: "b", indent: 1, counter: 1 },
        { type: "task", text: "c", indent: 2, checked: true },
        { type: "ordered", text: "d", indent: 1, counter: 2 },
        { type: "unordered", text: "e", indent: 0 },
      ]);
    });

    it("splits a list mixing task and non-task items", () => {
      editor = createMarkdownEditor("- a\n- [ ] b\n- c\n");
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "task", text: "b", indent: 0, checked: false },
        { type: "unordered", text: "c", indent: 0 },
      ]);
    });

    it("parses inline marks and text", () => {
      editor = createMarkdownEditor("- foo *bar*\n");
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "foo bar", indent: 0 },
      ]);
    });

    it("falls through to unordered when only it is installed", () => {
      editor = createMarkdownEditor("1. a\n    - [x] b\n- [ ] c\n", [
        FlatListUnordered,
      ]);
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 0 },
      ]);
    });

    it("falls through to task then unordered without ordered", () => {
      editor = createMarkdownEditor("1. a\n2. [x] b\n", [
        FlatListTask,
        FlatListUnordered,
      ]);
      assert.deepEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "task", text: "b", indent: 0, checked: true },
      ]);
    });

    it("parses ordered lists without unordered installed", () => {
      editor = createMarkdownEditor("1. a\n    1. b\n", [FlatListOrdered]);
      assert.deepEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 1, counter: 1 },
      ]);
    });
  });

  describe("render", () => {
    it("renders each list type with nesting", () => {
      editor = createMarkdownEditor("");
      editor.commands.setContent(
        "<ul><li>a<ol><li>b<ul data-task-list><li data-checked>c</li></ul></li><li>d</li></ol></li></ul>",
      );
      assert.equal(
        editor.getMarkdown(),
        "- a\n\n    1. b\n\n        - [x] c\n\n    1. d",
      );
    });

    it("round-trips", () => {
      const markdown = "- a\n    1. b\n        - [x] c\n    1. d\n- [ ] e\n";
      editor = createMarkdownEditor(markdown);
      const before = summarize(editor);
      editor.commands.setContent(editor.getMarkdown(), {
        contentType: "markdown",
      });
      assert.deepEqual(summarize(editor), before);
    });
  });
});
