import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { ImageEntry } from "../types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "bmp", "webp"]);

function joinPath(folderPath: string, filename: string) {
  return `${folderPath.replace(/[\\/]+$/, "")}/${filename}`;
}

function stem(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot <= 0 ? filename : filename.slice(0, dot);
}

function labelFilename(imageFilename: string) {
  return `${stem(imageFilename)}.txt`;
}

export async function pickFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open image folder",
  });
  return typeof selected === "string" ? selected : null;
}

export async function loadImagesFromFolder(folderPath: string): Promise<ImageEntry[]> {
  const entries = await readDir(folderPath);
  const imageFilenames = entries
    .filter((entry) => {
      const filename = entry.name ?? "";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      return Boolean(filename) && IMAGE_EXTENSIONS.has(ext);
    })
    .map((entry) => entry.name ?? "")
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  return Promise.all(
    imageFilenames.map(async (filename) => {
      const labelPath = joinPath(folderPath, labelFilename(filename));
      const annotated =
        (await exists(labelPath)) && (await readTextFile(labelPath)).trim().length > 0;
      return {
        filename,
        fullPath: joinPath(folderPath, filename),
        annotated,
      };
    }),
  );
}

export async function readLabelFile(folderPath: string, imageFilename: string): Promise<string> {
  const path = joinPath(folderPath, labelFilename(imageFilename));
  if (!(await exists(path))) return "";
  return readTextFile(path);
}

export async function writeLabelFile(
  folderPath: string,
  imageFilename: string,
  content: string,
): Promise<void> {
  await writeTextFile(joinPath(folderPath, labelFilename(imageFilename)), content);
}

export async function readClassesFile(folderPath: string): Promise<string> {
  const path = joinPath(folderPath, "classes.txt");
  if (!(await exists(path))) return "";
  return readTextFile(path);
}

export async function writeClassesFile(folderPath: string, content: string): Promise<void> {
  await writeTextFile(joinPath(folderPath, "classes.txt"), content);
}
