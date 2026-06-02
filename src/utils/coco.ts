import type { AnnotationClass, BBox, ImageEntry } from "../types";
import { yoloToPixel } from "./yolo";

export interface CocoImageAnnotations {
  image: ImageEntry;
  width: number;
  height: number;
  boxes: BBox[];
}

function round(value: number) {
  return Number(value.toFixed(3));
}

export function serializeCoco(
  imageAnnotations: CocoImageAnnotations[],
  classes: AnnotationClass[],
): string {
  let annotationId = 1;

  const images = imageAnnotations.map((item, index) => ({
    id: index + 1,
    file_name: item.image.filename,
    width: item.width,
    height: item.height,
  }));

  const annotations = imageAnnotations.flatMap((item, imageIndex) =>
    item.boxes.map((box) => {
      const pixel = yoloToPixel(box.cx, box.cy, box.w, box.h, item.width, item.height);
      const width = round(pixel.width);
      const height = round(pixel.height);
      return {
        id: annotationId++,
        image_id: imageIndex + 1,
        category_id: box.classId,
        bbox: [round(pixel.x), round(pixel.y), width, height],
        area: round(width * height),
        iscrowd: 0,
        segmentation: [],
      };
    }),
  );

  const categories = classes.map((item) => ({
    id: item.id,
    name: item.name,
    supercategory: "object",
  }));

  return JSON.stringify(
    {
      info: {
        description: "superlabel COCO annotations",
      },
      images,
      annotations,
      categories,
    },
    null,
    2,
  );
}
