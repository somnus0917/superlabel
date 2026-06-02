import { createStore, produce } from "solid-js/store";
import type {
  BBox,
  DrawMode,
  Language,
  OutputFormat,
  ProjectState,
  RightPanelTab,
} from "../types";
import { DEFAULT_COLORS } from "../utils/yolo";

interface AppStore {
  project: ProjectState | null;
  currentBoxes: BBox[];
  suggestedBoxes: BBox[];
  suggestedBoxesByImage: Record<string, BBox[]>;
  undoStack: BoxesHistorySnapshot[];
  redoStack: BoxesHistorySnapshot[];
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
  onnxClassMin: number;
  onnxClassMax: number;
  dirty: boolean;
}

interface BoxesHistorySnapshot {
  boxes: BBox[];
  selectedBoxId: string | null;
}

const MAX_HISTORY = 100;

const initialState: AppStore = {
  project: null,
  currentBoxes: [],
  suggestedBoxes: [],
  suggestedBoxesByImage: {},
  undoStack: [],
  redoStack: [],
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
  onnxClassMin: 0,
  onnxClassMax: 9999,
  dirty: false,
};

export const [state, setState] = createStore<AppStore>(initialState);

export function openProject(project: ProjectState) {
  setState({
    project: {
      ...project,
      currentIndex: Math.min(
        project.currentIndex,
        Math.max(project.images.length - 1, 0),
      ),
    },
    currentBoxes: [],
    suggestedBoxes: [],
    suggestedBoxesByImage: {},
    undoStack: [],
    redoStack: [],
    selectedBoxId: null,
    activeClassId: project.classes[0]?.id ?? 0,
    drawMode: "draw",
    dirty: false,
  });
}

export function setCurrentBoxes(boxes: BBox[], imageFilename?: string) {
  setState({
    currentBoxes: boxes,
    suggestedBoxes: imageFilename
      ? (state.suggestedBoxesByImage[imageFilename] ?? [])
      : [],
    undoStack: [],
    redoStack: [],
    selectedBoxId: null,
    dirty: false,
  });
}

export function goToImage(index: number) {
  if (!state.project) return;
  const nextIndex = Math.max(
    0,
    Math.min(index, state.project.images.length - 1),
  );
  setState(
    produce((draft) => {
      if (!draft.project) return;
      draft.project.currentIndex = nextIndex;
      draft.currentBoxes = [];
      const image = draft.project.images[nextIndex];
      draft.suggestedBoxes = image
        ? (draft.suggestedBoxesByImage[image.filename] ?? [])
        : [];
      clearBoxesHistory(draft);
      draft.selectedBoxId = null;
      draft.dirty = false;
    }),
  );
}

export function addBox(box: BBox) {
  setState(
    produce((draft) => {
      pushUndoSnapshot(draft);
      draft.currentBoxes.push(box);
      draft.selectedBoxId = box.id;
      draft.dirty = true;
    }),
  );
}

export function addBoxes(boxes: BBox[]) {
  if (boxes.length === 0) return;
  setState(
    produce((draft) => {
      pushUndoSnapshot(draft);
      const nextBoxes = withUniqueBoxIds(boxes);
      draft.currentBoxes.push(...nextBoxes);
      draft.selectedBoxId = nextBoxes[nextBoxes.length - 1].id;
      draft.dirty = true;
    }),
  );
}

export function setSuggestedBoxes(boxes: BBox[], imageFilename?: string) {
  const filename = imageFilename ?? currentImageFilename();
  const nextBoxes = withUniqueBoxIds(boxes, "suggestion");
  setState(
    produce((draft) => {
      if (filename) {
        draft.suggestedBoxesByImage[filename] = nextBoxes;
      }
      if (!filename || filename === currentImageFilename()) {
        draft.suggestedBoxes = nextBoxes;
      }
    }),
  );
}

export function acceptSuggestedBoxes() {
  if (state.suggestedBoxes.length === 0) return;
  const filename = currentImageFilename();
  setState(
    produce((draft) => {
      pushUndoSnapshot(draft);
      const nextBoxes = withUniqueBoxIds(draft.suggestedBoxes);
      draft.currentBoxes.push(...nextBoxes);
      draft.suggestedBoxes = [];
      if (filename) {
        delete draft.suggestedBoxesByImage[filename];
      }
      draft.selectedBoxId = nextBoxes[nextBoxes.length - 1].id;
      draft.dirty = true;
    }),
  );
}

export function clearSuggestedBoxes() {
  const filename = currentImageFilename();
  setState(
    produce((draft) => {
      draft.suggestedBoxes = [];
      if (filename) {
        delete draft.suggestedBoxesByImage[filename];
      }
    }),
  );
}

export function updateBox(id: string, patch: Partial<BBox>) {
  setState(
    produce((draft) => {
      const box = draft.currentBoxes.find((item) => item.id === id);
      if (!box) return;
      if (!boxChanged(box, patch)) return;
      pushUndoSnapshot(draft);
      Object.assign(box, patch);
      draft.dirty = true;
    }),
  );
}

export function deleteBox(id: string) {
  setState(
    produce((draft) => {
      if (!draft.currentBoxes.some((item) => item.id === id)) return;
      pushUndoSnapshot(draft);
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

export function undoBoxes() {
  setState(
    produce((draft) => {
      const snapshot = draft.undoStack.pop();
      if (!snapshot) return;
      draft.redoStack.push(createBoxesSnapshot(draft));
      draft.currentBoxes = cloneBoxes(snapshot.boxes);
      draft.selectedBoxId = snapshot.selectedBoxId;
      draft.dirty = true;
    }),
  );
}

export function redoBoxes() {
  setState(
    produce((draft) => {
      const snapshot = draft.redoStack.pop();
      if (!snapshot) return;
      draft.undoStack.push(createBoxesSnapshot(draft));
      draft.currentBoxes = cloneBoxes(snapshot.boxes);
      draft.selectedBoxId = snapshot.selectedBoxId;
      draft.dirty = true;
    }),
  );
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
      const annotationClass = draft.project?.classes.find(
        (item) => item.id === id,
      );
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

export function setOnnxClassMin(value: number) {
  if (!Number.isFinite(value)) return;
  const nextValue = Math.max(0, Math.round(value));
  setState("onnxClassMin", Math.min(nextValue, state.onnxClassMax));
}

export function setOnnxClassMax(value: number) {
  if (!Number.isFinite(value)) return;
  const nextValue = Math.max(0, Math.round(value));
  setState("onnxClassMax", Math.max(nextValue, state.onnxClassMin));
}

export function markSaved(filename: string) {
  setState(
    produce((draft) => {
      if (draft.project) {
        const image = draft.project.images.find(
          (item) => item.filename === filename,
        );
        if (image) {
          image.annotated = draft.currentBoxes.length > 0;
        }
      }
      draft.dirty = false;
    }),
  );
}

function withUniqueBoxIds(boxes: BBox[], prefix = "box") {
  const timestamp = Date.now();
  return boxes.map((box, index) => ({
    ...box,
    id: `${prefix}-${box.id}-${timestamp}-${index}`,
  }));
}

function pushUndoSnapshot(draft: AppStore) {
  draft.undoStack.push(createBoxesSnapshot(draft));
  if (draft.undoStack.length > MAX_HISTORY) {
    draft.undoStack.shift();
  }
  draft.redoStack = [];
}

function createBoxesSnapshot(
  stateLike: Pick<AppStore, "currentBoxes" | "selectedBoxId">,
) {
  return {
    boxes: cloneBoxes(stateLike.currentBoxes),
    selectedBoxId: stateLike.selectedBoxId,
  };
}

function cloneBoxes(boxes: BBox[]) {
  return boxes.map((box) => ({ ...box }));
}

function clearBoxesHistory(draft: AppStore) {
  draft.undoStack = [];
  draft.redoStack = [];
}

function boxChanged(box: BBox, patch: Partial<BBox>) {
  return Object.entries(patch).some(
    ([key, value]) => box[key as keyof BBox] !== value,
  );
}

function currentImageFilename() {
  const project = state.project;
  return project?.images[project.currentIndex]?.filename;
}
