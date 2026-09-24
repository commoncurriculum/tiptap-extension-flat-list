import type { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";
import { assert } from "chai";
import { createEditor } from "./helpers";

/**
 * Tests for FlatListTask's renderHTML, which is what getHTML/copying use.
 * (In the editor itself, the node view is used instead - but the two are meant
 * to produce the same layout.)
 */
describe("FlatListTask renderHTML", () => {
  let editor: Editor;

  afterEach(() => editor.destroy());

  /** Renders a single task node with the given attrs, via renderHTML (not the node view). */
  function renderTask(attrs: {
    indent?: number;
    checked?: boolean;
  }): HTMLElement {
    editor = createEditor("<p>Buy milk</p>");
    editor.commands.selectAll();
    editor.commands.setFlatListItem("task", attrs);

    const serializer = DOMSerializer.fromSchema(editor.schema);
    const container = document.createElement("div");
    container.appendChild(
      serializer.serializeFragment(editor.state.doc.content),
    );
    return container.firstElementChild as HTMLElement;
  }

  it("renders a UL > LI > label+div structure", () => {
    const ul = renderTask({});

    assert.strictEqual(ul.tagName, "UL");
    // Marks this as a task list, for our own parseHTML rule.
    assert.strictEqual(ul.getAttribute("data-task-list"), "");
    assert.strictEqual(ul.children.length, 1);

    const li = ul.firstElementChild as HTMLElement;
    assert.strictEqual(li.tagName, "LI");
    // The content element is the div, not the LI itself.
    const [label, div] = Array.from(li.children);
    assert.strictEqual(label.tagName, "LABEL");
    assert.strictEqual(div.tagName, "DIV");
    assert.strictEqual(div.textContent, "Buy milk");

    const [input, span] = Array.from(label.children);
    assert.strictEqual(input.tagName, "INPUT");
    assert.strictEqual(input.getAttribute("type"), "checkbox");
    assert.strictEqual(span.tagName, "SPAN");
  });

  it("disables the checkbox (the rendered HTML is non-interactive)", () => {
    const input = renderTask({}).querySelector("input")!;
    assert.strictEqual(input.getAttribute("disabled"), "");
  });

  it("omits checked markers when unchecked", () => {
    const ul = renderTask({ checked: false });
    const li = ul.firstElementChild as HTMLElement;

    assert.isFalse(li.hasAttribute("data-checked"));
    assert.isFalse(ul.querySelector("input")!.hasAttribute("checked"));
  });

  it("marks the LI and the checkbox when checked", () => {
    const ul = renderTask({ checked: true });
    const li = ul.firstElementChild as HTMLElement;

    assert.strictEqual(li.getAttribute("data-checked"), "");
    assert.strictEqual(ul.querySelector("input")!.getAttribute("checked"), "");
  });

  it("renders indent as data-list-indent and a margin", () => {
    for (const indent of [0, 1, 3]) {
      const ul = renderTask({ indent });
      const li = ul.firstElementChild as HTMLElement;

      // Omitted when 0.
      assert.strictEqual(
        li.getAttribute("data-list-indent"),
        indent === 0 ? null : String(indent),
      );
      assert.strictEqual(ul.style.marginLeft, `${20 * indent}px`);
      // The bullet is drawn by the checkbox, not by the UL.
      assert.strictEqual(ul.style.listStyleType, "none");
    }
  });

  it("labels the checkbox with the item's text", () => {
    const input = renderTask({}).querySelector("input")!;
    assert.strictEqual(
      input.getAttribute("aria-label"),
      "Task item checkbox for Buy milk",
    );
  });

  it("uses the a11y.checkboxLabel option when given", () => {
    editor = createEditor("<p>Buy milk</p>", {
      a11y: {
        checkboxLabel: (node, checked) =>
          `${checked ? "Done" : "Todo"}: ${node.textContent}`,
      },
    });
    editor.commands.selectAll();
    editor.commands.setFlatListItem("task", { checked: true });

    const serializer = DOMSerializer.fromSchema(editor.schema);
    const container = document.createElement("div");
    container.appendChild(
      serializer.serializeFragment(editor.state.doc.content),
    );

    assert.strictEqual(
      container.querySelector("input")!.getAttribute("aria-label"),
      "Done: Buy milk",
    );
  });
});
