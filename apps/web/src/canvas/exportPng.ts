import type Konva from "konva";

/** P1: wire this to a toolbar button. Not part of the MVP. */
export function exportStagePng(stage: Konva.Stage, pixelRatio = 2): string {
  return stage.toDataURL({ pixelRatio, mimeType: "image/png" });
}
