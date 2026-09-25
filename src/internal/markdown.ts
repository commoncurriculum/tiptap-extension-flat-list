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

export function parseItemContent(
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
export function parseNestedLists(
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

// Four spaces per level, which works with every list marker: a nested item has to
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
