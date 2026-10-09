export const USER_COLORS = [
  "#0f6e62",
  "#c4552a",
  "#1d4ed8",
  "#7c3aed",
  "#a16207",
  "#be123c",
  "#0e7490",
  "#15803d",
] as const;

export const STROKE_COLORS = [
  "#241c16",
  "#0f6e62",
  "#1d4ed8",
  "#be123c",
  "#c4552a",
  "#7c3aed",
  "#a16207",
] as const;

export const FILL_COLORS = [
  "transparent",
  "#fff4cc",
  "#d7f3ec",
  "#dbe7ff",
  "#ffe0d6",
  "#f3e8ff",
  "#ffffff",
] as const;

export const DEFAULT_STICKY_FILL = "#ffe08a";

export function colorFromId(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % USER_COLORS.length;
  }
  return USER_COLORS[hash] ?? USER_COLORS[0];
}
