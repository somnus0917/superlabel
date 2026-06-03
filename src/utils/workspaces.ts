import { load } from "@tauri-apps/plugin-store";
import type {
  Language,
  OutputFormat,
  ProjectState,
  ProjectWorkspace,
} from "../types";

const WORKSPACES_STORE = "superlabel-workspaces.json";
const WORKSPACES_KEY = "workspaces";
const MAX_WORKSPACES = 12;

interface WorkspaceInput {
  project: ProjectState;
  autoSave: boolean;
  outputFormat: OutputFormat;
  language: Language;
}

export async function readWorkspaces(): Promise<ProjectWorkspace[]> {
  try {
    const store = await load(WORKSPACES_STORE);
    const value = await store.get(WORKSPACES_KEY);
    if (!Array.isArray(value)) return [];
    return value
      .flatMap((item) => {
        const workspace = normalizeWorkspace(item);
        return workspace ? [workspace] : [];
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } catch {
    return [];
  }
}

export async function rememberWorkspace(
  input: WorkspaceInput,
): Promise<ProjectWorkspace[]> {
  const currentImage = input.project.images[input.project.currentIndex];
  const workspace: ProjectWorkspace = {
    id: workspaceId(
      input.project.imageFolderPath,
      input.project.labelFolderPath,
    ),
    name: workspaceNameFromPath(input.project.imageFolderPath),
    imageFolderPath: input.project.imageFolderPath,
    labelFolderPath: input.project.labelFolderPath,
    currentImageFilename: currentImage?.filename,
    currentIndex: input.project.currentIndex,
    updatedAt: Date.now(),
    autoSave: input.autoSave,
    outputFormat: input.outputFormat,
    language: input.language,
  };
  const nextWorkspaces = [
    workspace,
    ...(await readWorkspaces()).filter((item) => item.id !== workspace.id),
  ].slice(0, MAX_WORKSPACES);
  await writeWorkspaces(nextWorkspaces);
  return nextWorkspaces;
}

export async function removeWorkspace(id: string): Promise<ProjectWorkspace[]> {
  const nextWorkspaces = (await readWorkspaces()).filter(
    (item) => item.id !== id,
  );
  await writeWorkspaces(nextWorkspaces);
  return nextWorkspaces;
}

export function workspaceNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "workspace";
}

async function writeWorkspaces(workspaces: ProjectWorkspace[]) {
  const store = await load(WORKSPACES_STORE);
  await store.set(WORKSPACES_KEY, workspaces);
  await store.save();
}

function workspaceId(imageFolderPath: string, labelFolderPath: string) {
  return `${imageFolderPath}\n${labelFolderPath}`;
}

function normalizeWorkspace(value: unknown): ProjectWorkspace | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<ProjectWorkspace>;
  if (
    typeof item.id !== "string" ||
    typeof item.imageFolderPath !== "string" ||
    typeof item.labelFolderPath !== "string"
  ) {
    return null;
  }

  return {
    id: item.id,
    name:
      typeof item.name === "string" && item.name.trim()
        ? item.name
        : workspaceNameFromPath(item.imageFolderPath),
    imageFolderPath: item.imageFolderPath,
    labelFolderPath: item.labelFolderPath,
    currentImageFilename:
      typeof item.currentImageFilename === "string"
        ? item.currentImageFilename
        : undefined,
    currentIndex:
      typeof item.currentIndex === "number" &&
      Number.isFinite(item.currentIndex)
        ? Math.max(0, Math.round(item.currentIndex))
        : 0,
    updatedAt:
      typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
        ? item.updatedAt
        : 0,
    autoSave: item.autoSave === true,
    outputFormat: item.outputFormat === "coco" ? "coco" : "yolo",
    language: item.language === "zh" ? "zh" : "en",
  };
}
