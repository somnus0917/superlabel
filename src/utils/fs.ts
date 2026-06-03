import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AnnotationClass,
  BBox,
  ImageEntry,
  ProjectStats,
} from "../types";

export async function pickFolder(title: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickOnnxModel(title: string): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "ONNX", extensions: ["onnx"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickModelProfile(title: string): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [{ name: "Model Profile", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickModelProfileSavePath(
  title: string,
): Promise<string | null> {
  const selected = await save({
    title,
    filters: [{ name: "Model Profile", extensions: ["json"] }],
    defaultPath: "superlabel-model-profile.json",
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickPresetModelSavePath(
  title: string,
  defaultPath: string,
): Promise<string | null> {
  const selected = await save({
    title,
    filters: [{ name: "ONNX", extensions: ["onnx"] }],
    defaultPath,
  });
  return typeof selected === "string" ? selected : null;
}

export async function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await invoke("write_text_file", { path, content });
}

export async function downloadModelFile(
  url: string,
  destinationPath: string,
  progressId: string,
): Promise<string> {
  return invoke("download_model_file", { url, destinationPath, progressId });
}

export async function loadImagesFromFolder(
  imageFolderPath: string,
  labelFolderPath: string,
): Promise<ImageEntry[]> {
  return invoke("load_images_from_folder", {
    imageFolderPath,
    labelFolderPath,
  });
}

export async function readLabelFile(
  folderPath: string,
  imageFilename: string,
): Promise<string> {
  return invoke("read_label_file", { folderPath, imageFilename });
}

export async function writeLabelFile(
  folderPath: string,
  imageFilename: string,
  content: string,
): Promise<void> {
  await invoke("write_label_file", { folderPath, imageFilename, content });
}

export async function readShapesFile(
  folderPath: string,
  imageFilename: string,
): Promise<string> {
  return invoke("read_shapes_file", { folderPath, imageFilename });
}

export async function writeShapesFile(
  folderPath: string,
  imageFilename: string,
  content: string,
): Promise<void> {
  await invoke("write_shapes_file", { folderPath, imageFilename, content });
}

export async function readClassesFile(folderPath: string): Promise<string> {
  return invoke("read_classes_file", { folderPath });
}

export async function writeClassesFile(
  folderPath: string,
  content: string,
): Promise<void> {
  await invoke("write_classes_file", { folderPath, content });
}

export async function exportCocoFile(
  folderPath: string,
  images: ImageEntry[],
  classes: AnnotationClass[],
  currentImageFilename: string,
  currentBoxes: BBox[],
): Promise<void> {
  await invoke("export_coco_file", {
    folderPath,
    images,
    classes,
    currentImageFilename,
    currentBoxes,
  });
}

export async function computeProjectStats(
  folderPath: string,
  images: ImageEntry[],
  classes: AnnotationClass[],
  currentImageFilename: string,
  currentBoxes: BBox[],
): Promise<ProjectStats> {
  return invoke("compute_project_stats", {
    folderPath,
    images,
    classes,
    currentImageFilename,
    currentBoxes,
  });
}

export async function runOnnxDetection(
  modelPath: string,
  imagePath: string,
  inputSize: number,
  confidence: number,
  nms: number,
  classCount: number,
  classMin: number,
  classMax: number,
): Promise<BBox[]> {
  return invoke("run_onnx_detection", {
    modelPath,
    imagePath,
    inputSize,
    confidence,
    nms,
    classCount,
    classMin,
    classMax,
  });
}
