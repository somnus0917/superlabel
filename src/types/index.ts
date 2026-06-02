export interface BBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  classId: number;
}

export interface AnnotationClass {
  id: number;
  name: string;
  color: string;
}

export interface ImageEntry {
  filename: string;
  fullPath: string;
  annotated: boolean;
}

export interface ProjectState {
  imageFolderPath: string;
  labelFolderPath: string;
  images: ImageEntry[];
  currentIndex: number;
  classes: AnnotationClass[];
}

export type DrawMode = "draw" | "select";
export type Language = "en" | "zh";
export type OutputFormat = "yolo" | "coco";
