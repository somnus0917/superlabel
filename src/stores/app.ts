import { createStore, produce } from "solid-js/store";
import type { BBox, DrawMode, Language, OutputFormat, ProjectState, RightPanelTab } from "../types";
import { DEFAULT_COLORS } from "../utils/yolo";

interface AppStore {
  project: ProjectState | null;
  currentBoxes: BBox[];
  selectedBoxId: string | null;
  activeClassId: number;
  drawMode: DrawMode;
  autoSave: boolean;
  language: Language;
  outputFormat: OutputFormat;
  rightPanelTab: RightPanelTab;
  onnxModelPath: string | null;
  onnxInputSize: number;
  onnxConfidence: number;
  onnxNms: number;
  dirty: boolean;
}

const initialState: AppStore = {
  project: null,
  currentBoxes: [],
  selectedBoxId: null,
  activeClassId: 0,
  drawMode: "draw",
  autoSave: false,
  language: "en",
  outputFormat: "yolo",
  rightPanelTab: "classes",
  onnxModelPath: null,
  onnxInputSize: 640,
  onnxConfidence: 0.25,
  onnxNms: 0.45,
  dirty: false,
};

export const [state, setState] = createStore<AppStore>(initialState);

export function openProject(project: ProjectState) {
  setState({
    project: {
      ...project,
      currentIndex: Math.min(project.currentIndex, Math.max(project.images.length - 1, 0)),
    },
    currentBoxes: [],
    selectedBoxId: null,
    activeClassId: project.classes[0]?.id ?? 0,
    drawMode: "draw",
    dirty: false,
  });
}

export function setCurrentBoxes(boxes: BBox[]) {
  setState({
    currentBoxes: boxes,
    selectedBoxId: null,
    dirty: false,
  });
}

export function goToImage(index: number) {
  if (!state.project) return;
  const nextIndex = Math.max(0, Math.min(index, state.project.images.length - 1));
  setState(
    produce((draft) => {
      if (!draft.project) return;
      draft.project.currentIndex = nextIndex;
      draft.currentBoxes = [];
      draft.selectedBoxId = null;
      draft.dirty = false;
    }),
  );
}

export function addBox(box: BBox) {
  setState(
    produce((draft) => {
      draft.currentBoxes.push(box);
      draft.selectedBoxId = box.id;
      draft.dirty = true;
    }),
  );
}

export function updateBox(id: string, patch: Partial<BBox>) {
  setState(
    produce((draft) => {
      const box = draft.currentBoxes.find((item) => item.id === id);
      if (!box) return;
      Object.assign(box, patch);
      draft.dirty = true;
    }),
  );
}

export function deleteBox(id: string) {
  setState(
    produce((draft) => {
      draft.currentBoxes = draft.currentBoxes.filter((item) => item.id !== id);
      if (draft.selectedBoxId === id) {
        draft.selectedBoxId = null;
      }
      draft.dirty = true;
    }),
  );
}

export function selectBox(id: string | null) {
  setState("selectedBoxId", id);
}

export function addClass(name: string) {
  const trimmed = name.trim();
  if (!trimmed || !state.project) return;
  setState(
    produce((draft) => {
      if (!draft.project) return;
      const id = draft.project.classes.length;
      draft.project.classes.push({
        id,
        name: trimmed,
        color: DEFAULT_COLORS[id % DEFAULT_COLORS.length],
      });
      draft.activeClassId = id;
      draft.dirty = true;
    }),
  );
}

export function renameClass(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed || !state.project) return;
  setState(
    produce((draft) => {
      const annotationClass = draft.project?.classes.find((item) => item.id === id);
      if (!annotationClass || annotationClass.name === trimmed) return;
      annotationClass.name = trimmed;
      draft.dirty = true;
    }),
  );
}

export function setActiveClass(id: number) {
  setState("activeClassId", id);
}

export function setDrawMode(mode: DrawMode) {
  setState("drawMode", mode);
}

export function setAutoSave(enabled: boolean) {
  setState("autoSave", enabled);
}

export function setLanguage(language: Language) {
  setState("language", language);
}

export function setOutputFormat(outputFormat: OutputFormat) {
  setState("outputFormat", outputFormat);
}

export function setRightPanelTab(tab: RightPanelTab) {
  setState("rightPanelTab", tab);
}

export function setOnnxModelPath(path: string | null) {
  setState("onnxModelPath", path);
}

export function setOnnxInputSize(size: number) {
  if (!Number.isFinite(size)) return;
  setState("onnxInputSize", Math.max(32, Math.round(size)));
}

export function setOnnxConfidence(value: number) {
  if (!Number.isFinite(value)) return;
  setState("onnxConfidence", Math.max(0, Math.min(1, value)));
}

export function setOnnxNms(value: number) {
  if (!Number.isFinite(value)) return;
  setState("onnxNms", Math.max(0, Math.min(1, value)));
}

export function markSaved(filename: string) {
  setState(
    produce((draft) => {
      if (draft.project) {
        const image = draft.project.images.find((item) => item.filename === filename);
        if (image) {
          image.annotated = draft.currentBoxes.length > 0;
        }
      }
      draft.dirty = false;
    }),
  );
}
