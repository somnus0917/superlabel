import type {
  Language,
  OutputFormat,
  ProjectState,
  ProjectWorkspace,
} from "../types";

const WORKSPACES_KEY = "superlabel.workspaces.v1";
const MAX_WORKSPACES = 12;

interface WorkspaceInput {
  project: ProjectState;
  autoSave: boolean;
  outputFormat: OutputFormat;
  language: Language;
}

export function readWorkspaces(): ProjectWorkspace[] {
  try {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
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

export function rememberWorkspace(input: WorkspaceInput): ProjectWorkspace[] {
  const currentImage = input.project.images[input.project.currentIndex];
  const workspace: ProjectWorkspace = {
    id: workspaceId(input.project.imageFolderPath, input.project.labelFolderPath),
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
    ...readWorkspaces().filter((item) => item.id !== workspace.id),
  ].slice(0, MAX_WORKSPACES);
  writeWorkspaces(nextWorkspaces);
  return nextWorkspaces;
}

export function removeWorkspace(id: string): ProjectWorkspace[] {
  const nextWorkspaces = readWorkspaces().filter((item) => item.id !== id);
  writeWorkspaces(nextWorkspaces);
  return nextWorkspaces;
}

export function workspaceNameFromPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "workspace";
}

function writeWorkspaces(workspaces: ProjectWorkspace[]) {
  window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
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
      typeof item.currentIndex === "number" && Number.isFinite(item.currentIndex)
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
