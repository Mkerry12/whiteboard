export type Tool =
  | "select"
  | "pan"
  | "pen"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "sticky";

export interface ToolSpec {
  id: Tool;
  label: string;
  shortcut: string;
}

export const TOOLS: readonly ToolSpec[] = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "pan", label: "Pan", shortcut: "H" },
  { id: "pen", label: "Pen", shortcut: "P" },
  { id: "rect", label: "Rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "sticky", label: "Sticky note", shortcut: "N" },
];

const SHORTCUTS: Record<string, Tool> = {
  v: "select",
  h: "pan",
  p: "pen",
  r: "rect",
  o: "ellipse",
  l: "line",
  a: "arrow",
  t: "text",
  n: "sticky",
};

export function toolFromShortcut(key: string): Tool | null {
  return SHORTCUTS[key.toLowerCase()] ?? null;
}

/** Read-only visitors do not see drawing, style, or edit controls. */
export function showEditingTools(readOnly: boolean): boolean {
  return !readOnly;
}
