import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
} from "@tiptap/core";
import {
  orderedNodeName,
  taskNodeName,
  unorderedNodeName,
} from "./extension-names";
import { indentAttr } from "./utils";

// Markdown parsing works like parseHTML: each installed flat list extension registers a
// parseMarkdown handler for marked's "list" token, and @tiptap/markdown tries them in
// priority order (ordered > task > unordered), using the first non-empty result.
// Returning [] falls through to the next handler. Nested lists and item runs we don't
// claim are re-dispatched through helpers.parseChildren, so they fall through too.

export function parseOrderedMarkdown(
  token: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent[] {
  // Fall through to task or unordered list (if installed).
  if (!token.ordered) return [];

  const nodes: JSONContent[] = [];
  // CommonMark: the first item's number starts the list and the rest are
  // disregarded, so a list written as repeated "1." numbers 1, 2, 3.
  let counter = Number(token.start) || 1;
  for (const item of token.items ?? []) {
    nodes.push(
      helpers.createNode(
        orderedNodeName,
        { counter },
        parseItemContent(item, helpers),
      ),
    );
    counter++;
    nodes.push(...parseNestedLists(item, helpers));
  }
  return nodes;
}

export function parseTaskMarkdown(
  token: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent[] {
  const items = token.items ?? [];
  // Fall through to unordered list (if installed).
  if (!items.some((item) => item.task)) return [];

  // Markdown marks tasks per item, so claim only the task items and re-dispatch runs
  // of other items as their own list tokens.
  const nodes: JSONContent[] = [];
  let otherItems: MarkdownToken[] = [];
  const flushOtherItems = () => {
    if (otherItems.length === 0) return;
    nodes.push(...helpers.parseChildren([{ ...token, items: otherItems }]));
    otherItems = [];
  };

  for (const item of items) {
    if (!item.task) {
      otherItems.push(item);
      continue;
    }
    flushOtherItems();
    nodes.push(
      helpers.createNode(
        taskNodeName,
        { checked: item.checked === true },
        parseItemContent(item, helpers),
      ),
    );
    nodes.push(...parseNestedLists(item, helpers));
  }
  flushOtherItems();
  return nodes;
}

export function parseUnorderedMarkdown(
  token: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent[] {
  // Last in the priority order, so all remaining lists become unordered.
  const nodes: JSONContent[] = [];
  for (const item of token.items ?? []) {
    nodes.push(
      helpers.createNode(
        unorderedNodeName,
        {},
        parseItemContent(item, helpers),
      ),
    );
    nodes.push(...parseNestedLists(item, helpers));
  }
  return nodes;
}

function parseItemContent(
  item: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent[] {
  const contentTokens = (item.tokens ?? []).filter(
    (child) =>
      child.type !== "list" &&
      child.type !== "space" &&
      child.type !== "checkbox",
  );
  const textToken = contentTokens[0];
  const inlineTokens =
    textToken?.tokens ?? helpers.tokenizeInline?.(textToken?.text ?? "") ?? [];
  return helpers.parseInline(inlineTokens);
}

const flatListNodeNames = [orderedNodeName, unorderedNodeName, taskNodeName];

/**
 * Parses an item's nested lists through the registered handlers (so they use the same
 * fall-through as top-level lists), then indents the resulting flat list items one level.
 */
function parseNestedLists(
  item: MarkdownToken,
  helpers: MarkdownParseHelpers,
): JSONContent[] {
  const nested = (item.tokens ?? []).filter((child) => child.type === "list");
  if (nested.length === 0) return [];

  return helpers.parseChildren(nested).map((node) => {
    if (!flatListNodeNames.includes(node.type ?? "")) return node;
    const indent = (Number(node.attrs?.indent) || 0) + 1;
    return { ...node, attrs: { ...node.attrs, indent: indentAttr(indent) } };
  });
}

// Four spaces per level, which every marker we write can carry: a nested item has to
// reach its parent's content column ("1. " is 3, "- " is 2) and stay within three
// columns of it, or CommonMark reads it as a sibling item or as indented code.
const INDENT_PER_LEVEL = "    ";

export function renderFlatListMarkdown(
  node: JSONContent,
  helpers: MarkdownRendererHelpers,
): string {
  const ordered = node.type === orderedNodeName;
  // Every ordered item is written "1.", so the marker is always two columns wide and a
  // child's indent never depends on its parent's number. Renderers number the items
  // themselves, and parsing renumbers them from the first, so nothing is lost.
  let marker = "-";
  if (ordered) marker = "1.";
  else if (node.type === taskNodeName)
    marker = `- [${node.attrs?.checked ? "x" : " "}]`;

  const indent = INDENT_PER_LEVEL.repeat(Number(node.attrs?.indent) || 0);

  // Flat items contain inline nodes, so indent continuation lines without treating
  // each inline node as a nested block. A task checkbox is content, not the list marker.
  const continuation = indent + " ".repeat(ordered ? marker.length + 1 : 2);
  const content = helpers
    .renderChildren(node.content ?? [])
    .replaceAll("\n", `\n${continuation}`);
  return `${indent}${marker} ${content}`;
}
