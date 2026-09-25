import { assert } from "chai";
import { Editor } from "@tiptap/core";
import { createEditor, setCursorIn, summarize } from "./helpers";

/**
 * Tests for the counter/indent behavior that applies during normal edits,
 * i.e. flatListPostprocessorPlugin plus the indent/dedent commands.
 *
 * (Counters on *initial* content come from parseHTML instead; see html.test.ts.)
 */
describe("postprocessor plugin", () => {
  let editor: Editor;

  afterEach(() => editor.destroy());

  /** Turns `count` paragraphs into list items of the given type. */
  function setupList(
    count: number,
    listType: "ordered" | "unordered" | "task" = "ordered",
  ) {
    const letters = ["a", "b", "c", "d", "e"].slice(0, count);
    editor = createEditor(letters.map((l) => `<p>${l}</p>`).join(""));
    editor.commands.selectAll();
    editor.commands.setFlatListItem(listType);
    return letters;
  }

  describe("counters", () => {
    it("numbers consecutive ordered items", () => {
      setupList(3);
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 0, counter: 2 },
        { type: "ordered", text: "c", indent: 0, counter: 3 },
      ]);
    });

    it("renumbers after an item is deleted", () => {
      setupList(3);
      // Delete item "b" (positions: [0,3) is "a", [3,6) is "b").
      editor.commands.deleteRange({ from: 3, to: 6 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "c", indent: 0, counter: 2 },
      ]);
    });

    it("numbers each indent level separately", () => {
      setupList(4);
      for (const index of [1, 2]) {
        setCursorIn(editor, index);
        editor.commands.indentFlatListItem();
      }
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 1, counter: 1 },
        { type: "ordered", text: "c", indent: 1, counter: 2 },
        { type: "ordered", text: "d", indent: 0, counter: 2 },
      ]);
    });

    it("restarts a nested counter after returning to the outer level", () => {
      setupList(5);
      for (const index of [1, 3]) {
        setCursorIn(editor, index);
        editor.commands.indentFlatListItem();
      }
      // a(0), b(1), c(0), d(1), e(0): d starts a new nested list, so it restarts at 1.
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 1, counter: 1 },
        { type: "ordered", text: "c", indent: 0, counter: 2 },
        { type: "ordered", text: "d", indent: 1, counter: 1 },
        { type: "ordered", text: "e", indent: 0, counter: 3 },
      ]);
    });

    it("resets a counter that doesn't start from 1", () => {
      setupList(2);
      setCursorIn(editor, 0);
      editor.commands.updateAttributes("flatListItemOrdered", { counter: 3 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 0, counter: 2 },
      ]);
    });

    it("restarts the counter after a non-list block", () => {
      setupList(3);
      setCursorIn(editor, 1);
      editor.commands.setNode("paragraph");
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "paragraph", text: "b" },
        { type: "ordered", text: "c", indent: 0, counter: 1 },
      ]);
    });

    it("restarts the counter after an item of another list type", () => {
      setupList(3);
      setCursorIn(editor, 1);
      editor.commands.setFlatListItem("unordered");
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "unordered", text: "b", indent: 0 },
        { type: "ordered", text: "c", indent: 0, counter: 1 },
      ]);
    });
  });

  describe("indent / dedent commands", () => {
    it("refuses to indent the first item of a list", () => {
      setupList(2, "unordered");
      setCursorIn(editor, 0);
      assert.isFalse(editor.commands.indentFlatListItem());
      assert.strictEqual(summarize(editor)[0].indent, 0);
    });

    it("refuses to indent more than one past the previous item", () => {
      setupList(3, "unordered");
      setCursorIn(editor, 1);
      assert.isTrue(editor.commands.indentFlatListItem());
      assert.isFalse(editor.commands.indentFlatListItem());
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 0 },
      ]);
    });

    it("dedents descendants along with the dedented item", () => {
      setupList(4, "unordered");
      // a(0), b(1), c(2), d(1).
      setCursorIn(editor, 1);
      editor.commands.indentFlatListItem();
      setCursorIn(editor, 2);
      editor.commands.indentFlatListItem();
      editor.commands.indentFlatListItem();
      setCursorIn(editor, 3);
      editor.commands.indentFlatListItem();

      setCursorIn(editor, 1);
      assert.isTrue(editor.commands.dedentFlatListItem());
      // c and d were deeper than b, so they follow it up one level.
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 0 },
        { type: "unordered", text: "c", indent: 1 },
        { type: "unordered", text: "d", indent: 1 },
      ]);
    });

    it("converts to a paragraph when dedenting at indent 0 with canConvert", () => {
      setupList(2, "unordered");
      setCursorIn(editor, 1);
      assert.isFalse(editor.commands.dedentFlatListItem());
      assert.isTrue(editor.commands.dedentFlatListItem(true));
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "paragraph", text: "b" },
      ]);
    });

    it("preserves indent when switching list type", () => {
      setupList(2, "unordered");
      setCursorIn(editor, 1);
      editor.commands.indentFlatListItem();
      editor.commands.setFlatListItem("ordered");
      assert.deepStrictEqual(summarize(editor)[1], {
        type: "ordered",
        text: "b",
        indent: 1,
        counter: 1,
      });
    });
  });

  describe("indent repair", () => {
    /** Returns the position of the block at the given top-level index. */
    function posOf(index: number) {
      let pos = 0;
      for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
      return pos;
    }

    /**
     * Sets indents directly with a raw transaction, bypassing the indent command's checks
     * (like a collaborative edit might).
     */
    function setIndentsRaw(indents: Record<number, number>) {
      const tr = editor.state.tr;
      for (const [index, indent] of Object.entries(indents)) {
        tr.setNodeAttribute(posOf(Number(index)), "indent", indent);
      }
      editor.view.dispatch(tr);
    }

    it("clamps an item to one deeper than the previous item", () => {
      setupList(3, "unordered");
      setIndentsRaw({ 1: 3, 2: 0 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 0 },
      ]);
    });

    it("shifts descendants along with a clamped item", () => {
      setupList(5, "unordered");
      // a(0), b(3), c(4), d(3), e(5): b is shifted by 2, so its descendants
      // and its sibling d are too.
      setIndentsRaw({ 1: 3, 2: 4, 3: 3, 4: 5 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 2 },
        { type: "unordered", text: "d", indent: 1 },
        { type: "unordered", text: "e", indent: 2 },
      ]);
    });

    it("clamps a descendant that is still too deep after shifting", () => {
      setupList(3, "unordered");
      // a(0), b(3), c(6): b is shifted by 2, then c is shifted by 2 and clamped.
      setIndentsRaw({ 1: 3, 2: 6 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 2 },
      ]);
    });

    it("stops shifting after the clamped item's descendants", () => {
      setupList(4, "unordered");
      // a(0), b(1), c(4), d(2): c is shifted by 2, but d is not its descendant.
      setIndentsRaw({ 1: 1, 2: 4, 3: 2 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 2 },
        { type: "unordered", text: "d", indent: 2 },
      ]);
    });

    it("clamps the first item of a list to indent 0", () => {
      setupList(2, "unordered");
      // a(2), b(3): a is shifted by 2, and so is its child b.
      setIndentsRaw({ 0: 2, 1: 3 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
      ]);
    });

    it("clamps an item after a non-list block to indent 0", () => {
      setupList(3, "unordered");
      setIndentsRaw({ 1: 1, 2: 2 });
      setCursorIn(editor, 1);
      editor.commands.setNode("paragraph");
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "paragraph", text: "b" },
        { type: "unordered", text: "c", indent: 0 },
      ]);
    });

    it("repairs indents after the parent item is deleted", () => {
      setupList(4, "unordered");
      // a(0), b(1), c(2), d(3).
      setIndentsRaw({ 1: 1, 2: 2, 3: 3 });
      editor.commands.deleteRange({ from: posOf(1), to: posOf(2) });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "c", indent: 1 },
        { type: "unordered", text: "d", indent: 2 },
      ]);
    });

    it("leaves valid indents alone", () => {
      setupList(4, "unordered");
      // Dedenting by more than one level at a time is fine.
      setIndentsRaw({ 1: 1, 2: 2, 3: 0 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "unordered", text: "a", indent: 0 },
        { type: "unordered", text: "b", indent: 1 },
        { type: "unordered", text: "c", indent: 2 },
        { type: "unordered", text: "d", indent: 0 },
      ]);
    });

    it("computes counters from the repaired indents", () => {
      setupList(4);
      // a(0), b(1), c(1), d(2). Deleting a leaves b as the first item,
      // so b, c, and d are all shifted by 1.
      setIndentsRaw({ 1: 1, 2: 1, 3: 2 });
      editor.commands.deleteRange({ from: posOf(0), to: posOf(1) });
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "b", indent: 0, counter: 1 },
        { type: "ordered", text: "c", indent: 0, counter: 2 },
        { type: "ordered", text: "d", indent: 1, counter: 1 },
      ]);
    });

    it("counts shifted siblings in the same nested list", () => {
      setupList(3);
      // a(0), b(3), c(3) -> b and c are shifted to 1, so they form one level-1 list.
      setIndentsRaw({ 1: 3, 2: 3 });
      assert.deepStrictEqual(summarize(editor), [
        { type: "ordered", text: "a", indent: 0, counter: 1 },
        { type: "ordered", text: "b", indent: 1, counter: 1 },
        { type: "ordered", text: "c", indent: 1, counter: 2 },
      ]);
    });
  });
});
