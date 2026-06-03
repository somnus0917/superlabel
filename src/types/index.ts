export interface BBox {
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  classId: number;
}

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationShape {
  id: string;
  kind: ShapeTool;
  classId: number;
  points: AnnotationPoint[];
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

export interface ProjectWorkspace {
  id: string;
  name: string;
  imageFolderPath: string;
  labelFolderPath: string;
  currentImageFilename?: string;
  currentIndex: number;
  updatedAt: number;
  autoSave: boolean;
  outputFormat: OutputFormat;
  language: Language;
}

export interface ClassSampleStats {
  classId: number;
  name: string;
  color: string;
  count: number;
}

export interface StatsBin {
  key: string;
  count: number;
}

export interface ProjectStats {
  totalImages: number;
  annotatedImages: number;
  unannotatedImages: number;
  totalBoxes: number;
  avgBoxesPerAnnotatedImage: number;
  avgBboxWidth: number;
  avgBboxHeight: number;
  avgBboxArea: number;
  avgAspectRatio: number;
  estimatedRemainingMinutes: number;
  classCounts: ClassSampleStats[];
  aspectRatioBins: StatsBin[];
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
export type ShapeTool = "rect" | "polygon" | "point" | "circle" | "line";
export type Language = "en" | "zh";
export type OutputFormat = "yolo" | "coco";
export type RightPanelTab =
  | "classes"
  | "annotations"
  | "stats"
  | "assist"
  | "export";
