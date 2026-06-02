import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AnnotationClass, BBox, ImageEntry } from "../types";

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

export async function loadImagesFromFolder(
  imageFolderPath: string,
  labelFolderPath: string,
): Promise<ImageEntry[]> {
  return invoke("load_images_from_folder", { imageFolderPath, labelFolderPath });
}

export async function readLabelFile(folderPath: string, imageFilename: string): Promise<string> {
  return invoke("read_label_file", { folderPath, imageFilename });
}

export async function writeLabelFile(
  folderPath: string,
  imageFilename: string,
  content: string,
): Promise<void> {
  await invoke("write_label_file", { folderPath, imageFilename, content });
}

export async function readClassesFile(folderPath: string): Promise<string> {
  return invoke("read_classes_file", { folderPath });
}

export async function writeClassesFile(folderPath: string, content: string): Promise<void> {
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
