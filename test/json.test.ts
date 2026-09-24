import { assert } from "chai";
import type { Editor, JSONContent } from "@tiptap/core";
import { createEditor, setCursorIn } from "./helpers";

/** Returns each top-level block's attrs, as they appear in the doc's (stringified) JSON. */
function jsonAttrs(editor: Editor): JSONContent["attrs"][] {
  const json = JSON.parse(JSON.stringify(editor.getJSON())) as JSONContent;
  return (json.content ?? []).map((block) => block.attrs);
}

describe("JSON", () => {
  let editor: Editor;

  afterEach(() => editor.destroy());

  it("omits the default indent (0) for each list type", () => {
    editor = createEditor(
      "<ul><li>a</li></ul><ol><li>b</li></ol><ul data-task-list><li>c</li></ul>",
    );
    for (const attrs of jsonAttrs(editor)) {
      assert.notProperty(attrs, "indent");
    }
  });

  it("includes a nonzero indent", () => {
    editor = createEditor("<ul><li>a<ul><li>b</li></ul></li></ul>");
    assert.deepEqual(jsonAttrs(editor), [{}, { indent: 1 }]);
  });

  it("omits indent after dedenting to 0", () => {
    editor = createEditor("<ul><li>a<ul><li>b</li></ul></li></ul>");
    setCursorIn(editor, 1);
    editor.commands.dedentFlatListItem();
    assert.deepEqual(jsonAttrs(editor), [{}, {}]);
  });

  it("omits indent when set explicitly to 0", () => {
    editor = createEditor("<p>a</p>");
    editor.commands.selectAll();
    editor.commands.setFlatListItem("ordered", { indent: 0 });
    assert.notProperty(jsonAttrs(editor)[0], "indent");
  });

  it("round-trips through JSON", () => {
    editor = createEditor("<ul><li>a<ul><li>b</li></ul></li></ul>");
    const json = JSON.parse(JSON.stringify(editor.getJSON())) as JSONContent;
    editor.commands.setContent(json);
    assert.deepEqual(jsonAttrs(editor), [{}, { indent: 1 }]);
  });
});
