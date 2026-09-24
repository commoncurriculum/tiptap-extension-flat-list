import type { Editor } from "@tiptap/core";
import { assert } from "chai";
import { JoinListDOMSerializer } from "../src/index";
import { createEditor, setCursorIn, summarize } from "./helpers";

/**
 * Tests for loading "normal" (nested) HTML lists and writing them back out
 * with JoinListDOMSerializer.
 */
describe("normal HTML lists", () => {
  let editor: Editor;

  afterEach(() => editor.destroy());

  /** Loads html as initial content and returns the joined HTML for the result. */
  function roundTrip(html: string): string {
    editor = createEditor(html);
    return JoinListDOMSerializer.getHTML(editor);
  }

  /** Nudges the editor so that the postprocessor plugin runs (it only runs on transactions). */
  function runPostprocessor() {
    editor.commands.setTextSelection(1);
  }

  describe("parsing", () => {
    it("flattens a nested list into indent levels", () => {
      editor = createEditor(
        `<ul><li>one<ul><li>one-a</li><li>one-b<ul><li>one-b-i</li></ul></li></ul></li><li>two</li></ul>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "one", indent: 0 },
        { type: "unordered", text: "one-a", indent: 1 },
        { type: "unordered", text: "one-b", indent: 1 },
        { type: "unordered", text: "one-b-i", indent: 2 },
        { type: "unordered", text: "two", indent: 0 },
      ]);
    });

    it("picks up list numbering during parsing, before the postprocessor runs", () => {
      // The postprocessor plugin doesn't run on initial content, so these counters
      // must come from FlatListOrdered's parseHTML rule.
      editor = createEditor(
        `<ol><li>one</li><li>two<ol><li>two-a</li><li>two-b</li></ol></li><li>three</li></ol>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "one", indent: 0, counter: 1 },
        { type: "ordered", text: "two", indent: 0, counter: 2 },
        { type: "ordered", text: "two-a", indent: 1, counter: 1 },
        { type: "ordered", text: "two-b", indent: 1, counter: 2 },
        { type: "ordered", text: "three", indent: 0, counter: 3 },
      ]);

      // ...and the postprocessor agrees, so nothing changes once it runs.
      const parsed = summarize(editor);
      runPostprocessor();
      assert.deepStrictEqual(summarize(editor), parsed);
    });

    it("handles a list type change at the same nesting level", () => {
      editor = createEditor(
        `<ol><li>one<ul><li>bullet</li></ul></li><li>two</li></ol>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "one", indent: 0, counter: 1 },
        { type: "unordered", text: "bullet", indent: 1 },
        { type: "ordered", text: "two", indent: 0, counter: 2 },
      ]);
    });

    it("parses our own task list markup", () => {
      editor = createEditor(
        `<ul data-task-list=""><li data-checked=""><div>done</div></li><li><div>todo</div></li></ul>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "task", text: "done", indent: 0, checked: true },
        { type: "task", text: "todo", indent: 0, checked: false },
      ]);
    });

    it("replaces paragraphs inside an LI with its content", () => {
      editor = createEditor(`<ul><li><p>one</p></li><li><p>two</p></li></ul>`);
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "one", indent: 0 },
        { type: "unordered", text: "two", indent: 0 },
      ]);
    });

    it("prefers data-list-indent over nesting depth", () => {
      // This is how we re-read our own rendered HTML, and it can express
      // indent jumps that plain nesting can't (here: 1, 0, 1).
      editor = createEditor(
        `<ul><li data-list-indent="1">a</li><li data-list-indent="0">b</li><li data-list-indent="1">c</li></ul>`,
      );
      assert.deepStrictEqual(
        summarize(editor).map((block) => block.indent),
        [1, 0, 1],
      );
    });
  });

  describe("LIs with no content before a nested list", () => {
    it("keeps an LI that only contains a nested list", () => {
      editor = createEditor(
        `<ul><li><ul><li>nested</li></ul></li><li>second</li></ul>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "", indent: 0 },
        { type: "unordered", text: "nested", indent: 1 },
        { type: "unordered", text: "second", indent: 0 },
      ]);
    });

    it("keeps an empty ordered item numbered", () => {
      editor = createEditor(
        `<ol><li><ol><li>nested</li></ol></li><li>second</li></ol>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "", indent: 0, counter: 1 },
        { type: "ordered", text: "nested", indent: 1, counter: 1 },
        { type: "ordered", text: "second", indent: 0, counter: 2 },
      ]);
    });

    it("keeps an LI whose nested list is only preceded by whitespace", () => {
      // The leading newline/indentation is collapsible, so it doesn't count as content.
      editor = createEditor(`<ul>
        <li>
          <ul><li>nested</li></ul>
        </li>
      </ul>`);
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "", indent: 0 },
        { type: "unordered", text: "nested", indent: 1 },
      ]);
    });

    it("keeps a hard break that precedes the nested list", () => {
      editor = createEditor(`<ul><li><br><ul><li>nested</li></ul></li></ul>`);
      const first = editor.state.doc.child(0);
      assert.strictEqual(first.childCount, 1);
      assert.strictEqual(first.child(0).type.name, "hardBreak");
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "", indent: 0 },
        { type: "unordered", text: "nested", indent: 1 },
      ]);
    });

    it("keeps several levels of empty LIs", () => {
      editor = createEditor(
        `<ul><li><ul><li><ul><li>deep</li></ul></li></ul></li></ul>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "", indent: 0 },
        { type: "unordered", text: "", indent: 1 },
        { type: "unordered", text: "deep", indent: 2 },
      ]);
    });

    it("keeps an empty task item", () => {
      editor = createEditor(
        `<ul data-task-list=""><li data-checked=""><div><ul data-task-list=""><li><div>nested</div></li></ul></div></li></ul>`,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "task", text: "", indent: 0, checked: true },
        { type: "task", text: "nested", indent: 1, checked: false },
      ]);
    });

    it("keeps an LI that only contains a nested list when pasted", () => {
      editor = createEditor(`<p>intro</p><p></p>`);
      setCursorIn(editor, 1);
      editor.view.pasteHTML(
        `<ul><li><ul><li>nested</li></ul></li><li>second</li></ul>`,
        // jsdom lacks ClipboardEvent, which pasteHTML would otherwise construct.
        new Event("paste") as ClipboardEvent,
      );
      assert.deepStrictEqual(summarize(editor), [
        { type: "paragraph", text: "intro" },
        { type: "unordered", text: "", indent: 0 },
        { type: "unordered", text: "nested", indent: 1 },
        { type: "unordered", text: "second", indent: 0 },
      ]);
    });
  });

  describe("rendering with JoinListDOMSerializer", () => {
    it("joins the single-LI lists back into one list", () => {
      assert.strictEqual(
        roundTrip(`<ul><li>one</li><li>two</li></ul>`),
        `<ul style="margin-bottom: 0px; list-style-type: disc;">` +
          `<li>one</li><li>two</li></ul>`,
      );
    });

    it("re-nests indented items and drops data-list-indent", () => {
      assert.strictEqual(
        roundTrip(`<ul><li>one<ul><li>one-a</li></ul></li><li>two</li></ul>`),
        `<ul style="margin-bottom: 0px; list-style-type: disc;">` +
          `<li>one<ul style="margin-bottom: 0px; list-style-type: disc;">` +
          `<li>one-a</li></ul></li><li>two</li></ul>`,
      );
    });

    it("drops the OL start attribute, since joined lists carry order in the LIs", () => {
      const html = roundTrip(
        `<p>intro</p><ol><li>one</li><li>two</li></ol><p>break</p><ol><li>restart</li></ol>`,
      );
      // A joined list's start attr is dropped (it's 1 anyway); the counters live in
      // the LIs' order within each OL.
      assert.notInclude(html, "start=");
      assert.strictEqual(
        html,
        `<p>intro</p>` +
          `<ol style="margin-bottom: 0px; list-style-type: decimal;"><li>one</li><li>two</li></ol>` +
          `<p>break</p>` +
          `<ol style="margin-bottom: 0px; list-style-type: decimal;"><li>restart</li></ol>`,
      );
    });

    it("starts a new list when the list type changes", () => {
      assert.strictEqual(
        roundTrip(`<ol><li>one</li></ol><ul><li>bullet</li></ul>`),
        `<ol style="margin-bottom: 0px; list-style-type: decimal;"><li>one</li></ol>` +
          `<ul style="margin-bottom: 0px; list-style-type: disc;"><li>bullet</li></ul>`,
      );
    });

    it("keeps task markup, including checked state", () => {
      const html = roundTrip(
        `<ul data-task-list=""><li data-checked=""><div>done</div></li><li><div>todo</div></li></ul>`,
      );
      assert.include(html, `<ul data-task-list=""`);
      // One joined UL, with both LIs inside.
      assert.strictEqual(html.split("<ul").length - 1, 1);
      assert.strictEqual(html.split("<li").length - 1, 2);
      assert.include(html, `<li data-checked=""`);
      assert.include(html, `<div>done</div>`);
      assert.include(html, `<div>todo</div>`);
    });

    it("round-trips a nested mixed list", () => {
      const html =
        `<ol style="margin-bottom: 0px; list-style-type: decimal;">` +
        `<li>one<ul style="margin-bottom: 0px; list-style-type: disc;">` +
        `<li>bullet</li></ul></li><li>two</li></ol>`;
      assert.strictEqual(roundTrip(html), html);
    });

    it("round-trips a list whose first item only contains a nested list", () => {
      editor = createEditor(
        `<ul><li><ul><li>nested</li></ul></li><li>second</li></ul>`,
      );
      assert.strictEqual(
        JoinListDOMSerializer.getHTML(editor),
        `<ul style="margin-bottom: 0px; list-style-type: disc;">` +
          `<li><ul style="margin-bottom: 0px; list-style-type: disc;">` +
          `<li>nested</li></ul></li><li>second</li></ul>`,
      );
    });

    it("survives a parse/render/parse cycle with edits in between", () => {
      editor = createEditor(
        `<ol><li>one</li><li>two<ol><li>two-a</li></ol></li></ol>`,
      );
      // Add a third top-level item by splitting at the end of "two-a" and dedenting.
      setCursorIn(editor, 2);
      editor.commands.insertContent({
        type: editor.state.doc.child(2).type.name,
        attrs: editor.state.doc.child(2).attrs,
      });
      editor.commands.insertContent("three");
      editor.commands.dedentFlatListItem();
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "one", indent: 0, counter: 1 },
        { type: "ordered", text: "two", indent: 0, counter: 2 },
        { type: "ordered", text: "two-a", indent: 1, counter: 1 },
        { type: "ordered", text: "three", indent: 0, counter: 3 },
      ]);

      const html = JoinListDOMSerializer.getHTML(editor);
      const reloaded = createEditor(html);
      try {
        assert.deepStrictEqual(summarize(reloaded), summarize(editor));
      } finally {
        reloaded.destroy();
      }
    });
  });
});
