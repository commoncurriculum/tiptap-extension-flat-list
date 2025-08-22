import { Node } from "@tiptap/pm/model"
import { orderedNodeName, taskNodeName, unorderedNodeName } from "./internal/extension-names"

export type ListType = "ordered" | "unordered" | "task"

export function isFlatListNode(node: Node): boolean {
  return getListType(node) !== null
}

/**
 * If the given node is a flat list node, returns its ListType, else returns null.
 */
export function getListType(node: Node): ListType | null {
  switch (node.type.name) {
    case orderedNodeName:
      return "ordered"
    case unorderedNodeName:
      return "unordered"
    case taskNodeName:
      return "task"
    default:
      return null
  }
}

/**
 * Returns the node.type.name corresponding to a ListType.
 */
export function getFlatListNodeName(listType: ListType) {
  switch (listType) {
    case "ordered":
      return orderedNodeName
    case "unordered":
      return unorderedNodeName
    case "task":
      return taskNodeName
  }
}
