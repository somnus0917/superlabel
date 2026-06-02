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
  folderPath: string;
  images: ImageEntry[];
  currentIndex: number;
  classes: AnnotationClass[];
}

export type DrawMode = "draw" | "select";
