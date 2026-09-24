import { JSDOM } from "jsdom";

// Tiptap/ProseMirror need a DOM to run in, so install a jsdom one as globals
// before any test (or the library) touches `document`.
const dom: JSDOM = new JSDOM("<!DOCTYPE html><html><body></body></html>");

const globalAny = globalThis as unknown as Record<string, unknown>;
const domWindow = dom.window as unknown as Record<string, unknown>;
globalAny.window = dom.window;
globalAny.document = dom.window.document;
// navigator is getter-only on globalThis, so it can't just be assigned.
Object.defineProperty(globalAny, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
globalAny.DOMParser = dom.window.DOMParser;
globalAny.getSelection = dom.window.getSelection.bind(dom.window);

// Element classes used by `instanceof` checks in src/ and in ProseMirror.
for (const name of Object.getOwnPropertyNames(dom.window)) {
  if (
    (name.startsWith("HTML") ||
      [
        "Node",
        "Text",
        "Element",
        "Comment",
        "DocumentFragment",
        "Event",
        "MutationObserver",
      ].includes(name)) &&
    globalAny[name] === undefined
  ) {
    globalAny[name] = domWindow[name];
  }
}
