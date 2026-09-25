/**
 * The node type names of the flat list extensions.
 */
export type FlatListType =
  "flatListItemOrdered" | "flatListItemUnordered" | "flatListItemTask";

/**
 * Returns whether the given node type name is a flat list node type.
 */
export function isFlatListType(type: string | undefined): type is FlatListType {
  return (
    [
      "flatListItemOrdered",
      "flatListItemUnordered",
      "flatListItemTask",
    ] as Array<string | undefined>
  ).includes(type);
}
