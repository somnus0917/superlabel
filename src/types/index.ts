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
  width: number;
  height: number;
}

export interface ProjectState {
  imageFolderPath: string;
  labelFolderPath: string;
  images: ImageEntry[];
  currentIndex: number;
  classes: AnnotationClass[];
}

export interface ModelProfile {
  version: 1;
  name: string;
  type: "yolo";
  modelPath: string;
  inputSize: number;
  confidence: number;
  nms: number;
  classMin: number;
  classMax: number;
  classes?: string[];
  classMap?: Record<string, number>;
}

export type DrawMode = "draw" | "select";
export type Language = "en" | "zh";
export type OutputFormat = "yolo" | "coco";
export type RightPanelTab = "classes" | "annotations" | "assist" | "export";
