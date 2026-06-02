import type { AnnotationClass, BBox } from "../types";

export const DEFAULT_COLORS = [
  "#FF4444",
  "#44AAFF",
  "#44FF88",
  "#FFAA00",
  "#FF44FF",
  "#00FFFF",
  "#FF8844",
  "#88FF44",
  "#AA44FF",
  "#FF4488",
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function parseYolo(text: string): BBox[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line, index) => {
      const [classId, cx, cy, w, h] = line.split(/\s+/).map(Number);
      if ([classId, cx, cy, w, h].some((value) => Number.isNaN(value))) {
        return [];
      }
      return [
        {
          id: `box-${Date.now()}-${index}`,
          classId,
          cx: clamp01(cx),
          cy: clamp01(cy),
          w: clamp01(w),
          h: clamp01(h),
        },
      ];
    });
}

export function serializeYolo(boxes: BBox[]): string {
  return boxes
    .map(
      (box) =>
        `${box.classId} ${box.cx.toFixed(6)} ${box.cy.toFixed(6)} ${box.w.toFixed(6)} ${box.h.toFixed(6)}`,
    )
    .join("\n");
}

export function parseClasses(text: string): AnnotationClass[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name, id) => ({
      id,
      name,
      color: DEFAULT_COLORS[id % DEFAULT_COLORS.length],
    }));
}

export function serializeClasses(classes: AnnotationClass[]): string {
  return classes.map((item) => item.name).join("\n");
}

export function yoloToPixel(
  cx: number,
  cy: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: (cx - w / 2) * imgW,
    y: (cy - h / 2) * imgH,
    width: w * imgW,
    height: h * imgH,
  };
}

export function pixelToYolo(
  x: number,
  y: number,
  width: number,
  height: number,
  imgW: number,
  imgH: number,
): Pick<BBox, "cx" | "cy" | "w" | "h"> {
  return {
    cx: clamp01((x + width / 2) / imgW),
    cy: clamp01((y + height / 2) / imgH),
    w: clamp01(width / imgW),
    h: clamp01(height / imgH),
  };
}
