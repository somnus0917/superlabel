import type { AnnotationShape } from "../types";

interface ShapeFile {
  version: 1;
  shapes: AnnotationShape[];
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeShape(shape: AnnotationShape): AnnotationShape {
  return {
    id: shape.id,
    kind: shape.kind,
    classId: shape.classId,
    points: shape.points.map((point) => ({
      x: clamp01(point.x),
      y: clamp01(point.y),
    })),
  };
}

export function parseShapes(text: string): AnnotationShape[] {
  if (!text.trim()) return [];
  const data = JSON.parse(text) as Partial<ShapeFile>;
  if (!Array.isArray(data.shapes)) return [];

  return data.shapes.flatMap((shape) => {
    if (
      !shape ||
      typeof shape.id !== "string" ||
      typeof shape.classId !== "number" ||
      !["polygon", "point", "circle", "line"].includes(shape.kind) ||
      !Array.isArray(shape.points)
    ) {
      return [];
    }
    return [normalizeShape(shape)];
  });
}

export function serializeShapes(shapes: AnnotationShape[]) {
  const data: ShapeFile = {
    version: 1,
    shapes: shapes.map(normalizeShape),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}
