import type { Node } from "@tiptap/pm/model";

/**
 * The node type names of the flat list extensions.
 */
export type FlatListType =
  "flatListItemOrdered" | "flatListItemTask" | "flatListItemUnordered";

/**
 * Returns whether the given node type name is a flat list node type.
 */
export function isFlatListType(type: string | undefined): type is FlatListType {
  return (
    [
      "flatListItemOrdered",
      "flatListItemTask",
      "flatListItemUnordered",
    ] as Array<string | undefined>
  ).includes(type);
}

/**
 * Returns whether the given node is a flat list node.
 */
export function isFlatListNode(node: Node): boolean {
  return isFlatListType(node.type.name);
}
