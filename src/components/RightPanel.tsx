import { createSignal, For, Show } from "solid-js";
import {
  addClass,
  acceptSuggestedBoxes,
  applyModelProfile,
  clearSuggestedBoxes,
  deleteBox,
  renameClass,
  selectBox,
  setActiveClass,
  setAutoSave,
  setLanguage,
  setOnnxClassMax,
  setOnnxClassMin,
  setOnnxConfidence,
  setOnnxInputSize,
  setOnnxModelPath,
  setOnnxNms,
  setOutputFormat,
  setRightPanelTab,
  setSuggestedBoxes,
  state,
  updateBox,
} from "../stores/app";
import type {
  Language,
  ModelProfile,
  OutputFormat,
  RightPanelTab,
} from "../types";
import {
  pickModelProfile,
  pickModelProfileSavePath,
  pickOnnxModel,
  readTextFile,
  runOnnxDetection,
  writeTextFile,
} from "../utils/fs";
import { tr } from "../utils/i18n";

const PANEL_TABS: RightPanelTab[] = [
  "classes",
  "annotations",
  "assist",
  "export",
];

export default function RightPanel() {
  const [className, setClassName] = createSignal("");
  const [editingClassId, setEditingClassId] = createSignal<number | null>(null);
  const [editingClassName, setEditingClassName] = createSignal("");
  const [isRunningOnnx, setIsRunningOnnx] = createSignal(false);
  const [onnxStatus, setOnnxStatus] = createSignal("");
  const [onnxProgress, setOnnxProgress] = createSignal("");

  function submitClass(event: SubmitEvent) {
    event.preventDefault();
    addClass(className());
    setClassName("");
  }

  function classForId(id: number) {
    return state.project?.classes.find((item) => item.id === id);
  }

  function startRenameClass(id: number, name: string) {
    setEditingClassId(id);
    setEditingClassName(name);
  }

  function commitRenameClass() {
    const id = editingClassId();
    if (id !== null) {
      renameClass(id, editingClassName());
    }
    setEditingClassId(null);
    setEditingClassName("");
  }

  function cancelRenameClass() {
    setEditingClassId(null);
    setEditingClassName("");
  }

  async function chooseOnnxModel() {
    const modelPath = await pickOnnxModel(
      tr(state.language, "dialogOpenOnnxModel"),
    );
    if (modelPath) {
      setOnnxModelPath(modelPath);
    }
  }

  async function loadModelProfile() {
    const profilePath = await pickModelProfile(
      tr(state.language, "dialogOpenModelProfile"),
    );
    if (!profilePath) return;

    try {
      const profile = parseModelProfile(await readTextFile(profilePath));
      applyModelProfile(profile);
      setOnnxStatus(`${tr(state.language, "profileLoaded")}: ${profile.name}`);
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "profileInvalid")}: ${String(error)}`,
      );
    }
  }

  async function saveModelProfile() {
    if (!state.onnxModelPath) return;
    const profilePath = await pickModelProfileSavePath(
      tr(state.language, "dialogSaveModelProfile"),
    );
    if (!profilePath) return;

    const profile = currentModelProfile(profilePath);
    await writeTextFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
    setOnnxStatus(`${tr(state.language, "profileSaved")}: ${profile.name}`);
  }

  function modelName() {
    if (!state.onnxModelPath) return tr(state.language, "noOnnxModel");
    return state.onnxModelPath.split(/[\\/]/).pop() ?? state.onnxModelPath;
  }

  function profileName() {
    return state.onnxProfileName ?? tr(state.language, "unsavedProfile");
  }

  async function runCurrentImageDetection() {
    const project = state.project;
    const image = project?.images[project.currentIndex];
    if (!state.onnxModelPath || !image || isRunningOnnx()) return;

    setIsRunningOnnx(true);
    setOnnxStatus(tr(state.language, "inferenceRunning"));
    try {
      const boxes = await runOnnxDetection(
        state.onnxModelPath,
        image.fullPath,
        state.onnxInputSize,
        state.onnxConfidence,
        state.onnxNms,
        project.classes.length,
        state.onnxClassMin,
        state.onnxClassMax,
      );
      setSuggestedBoxes(boxes);
      setOnnxStatus(
        `${boxes.length} ${tr(state.language, "suggestionsReady")}`,
      );
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "inferenceFailed")}: ${String(error)}`,
      );
    } finally {
      setIsRunningOnnx(false);
    }
  }

  async function runAllImagesDetection() {
    const project = state.project;
    if (!state.onnxModelPath || !project || isRunningOnnx()) return;

    setIsRunningOnnx(true);
    setOnnxStatus(tr(state.language, "inferenceRunning"));
    setOnnxProgress(`0/${project.images.length}`);
    try {
      let totalBoxes = 0;
      for (const [index, image] of project.images.entries()) {
        setOnnxProgress(`${index + 1}/${project.images.length}`);
        const boxes = await runOnnxDetection(
          state.onnxModelPath,
          image.fullPath,
          state.onnxInputSize,
          state.onnxConfidence,
          state.onnxNms,
          project.classes.length,
          state.onnxClassMin,
          state.onnxClassMax,
        );
        totalBoxes += boxes.length;
        setSuggestedBoxes(boxes, image.filename);
      }
      setOnnxStatus(
        `${project.images.length} ${tr(state.language, "imagesProcessed")}, ${totalBoxes} ${tr(state.language, "suggestionsReady")}`,
      );
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "inferenceFailed")}: ${String(error)}`,
      );
    } finally {
      setIsRunningOnnx(false);
      setOnnxProgress("");
    }
  }

  function tabLabel(tab: RightPanelTab) {
    if (tab === "classes") return tr(state.language, "classes");
    if (tab === "annotations") return tr(state.language, "annotations");
    if (tab === "assist") return tr(state.language, "assist");
    return tr(state.language, "export");
  }

  function acceptSuggestions() {
    const count = state.suggestedBoxes.length;
    if (count === 0) return;
    acceptSuggestedBoxes();
    setOnnxStatus(`${count} ${tr(state.language, "detectionsAdded")}`);
  }

  function clearSuggestions() {
    clearSuggestedBoxes();
    setOnnxStatus(tr(state.language, "suggestionsCleared"));
  }

  function changeBoxClass(boxId: string, classId: number) {
    selectBox(boxId);
    updateBox(boxId, { classId });
  }

  return (
    <aside class="right-panel panel">
      <nav class="panel-tabs">
        <For each={PANEL_TABS}>
          {(tab) => (
            <button
              class={`panel-tab ${state.rightPanelTab === tab ? "active" : ""}`}
              type="button"
              onClick={() => setRightPanelTab(tab)}
            >
              {tabLabel(tab)}
            </button>
          )}
        </For>
      </nav>

      <div class="panel-tab-body">
        <Show when={state.rightPanelTab === "classes"}>
          <section class="right-tab-content">
            <header class="panel-header">
              <span>{tr(state.language, "classes")}</span>
            </header>
            <div class="class-list">
              <For each={state.project?.classes ?? []}>
                {(item) => (
                  <div
                    class={`class-row ${state.activeClassId === item.id ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveClass(item.id)}
                  >
                    <span
                      class="swatch"
                      style={{ "background-color": item.color }}
                    />
                    <Show
                      when={editingClassId() === item.id}
                      fallback={<span class="truncate">{item.name}</span>}
                    >
                      <input
                        class="class-rename-input"
                        value={editingClassName()}
                        onClick={(event) => event.stopPropagation()}
                        onInput={(event) =>
                          setEditingClassName(event.currentTarget.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitRenameClass();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameClass();
                          }
                        }}
                        onBlur={commitRenameClass}
                        autofocus
                      />
                    </Show>
                    <span class="muted">#{item.id}</span>
                    <button
                      type="button"
                      class="rename-button"
                      title={tr(state.language, "renameClass")}
                      onClick={(event) => {
                        event.stopPropagation();
                        startRenameClass(item.id, item.name);
                      }}
                    >
                      ✎
                    </button>
                  </div>
                )}
              </For>
            </div>
            <form class="add-class" onSubmit={submitClass}>
              <input
                value={className()}
                onInput={(event) => setClassName(event.currentTarget.value)}
                placeholder={tr(state.language, "newClass")}
              />
              <button type="submit">+</button>
            </form>
          </section>
        </Show>

        <Show when={state.rightPanelTab === "annotations"}>
          <section class="right-tab-content">
            <header class="panel-header">
              <span>{tr(state.language, "annotations")}</span>
              <span class="badge">{state.currentBoxes.length}</span>
            </header>
            <div class="annotation-list">
              <Show
                when={state.currentBoxes.length > 0}
                fallback={
                  <p class="empty-hint">
                    {tr(state.language, "noAnnotations")}
                  </p>
                }
              >
                <For each={state.currentBoxes}>
                  {(box) => {
                    const item = () => classForId(box.classId);
                    return (
                      <div
                        class={`annotation-row ${state.selectedBoxId === box.id ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectBox(box.id)}
                      >
                        <span
                          class="swatch"
                          style={{
                            "background-color": item()?.color ?? "#4a9eff",
                          }}
                        />
                        <select
                          class="annotation-class-select"
                          value={box.classId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            changeBoxClass(
                              box.id,
                              Number(event.currentTarget.value),
                            )
                          }
                        >
                          <For each={state.project?.classes ?? []}>
                            {(annotationClass) => (
                              <option value={annotationClass.id}>
                                #{annotationClass.id} {annotationClass.name}
                              </option>
                            )}
                          </For>
                          <Show when={!item()}>
                            <option value={box.classId}>
                              {tr(state.language, "classPrefix")} #{box.classId}
                            </option>
                          </Show>
                        </select>
                        <span
                          class="delete-button"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteBox(box.id);
                          }}
                        >
                          x
                        </span>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </div>
          </section>
        </Show>

        <Show when={state.rightPanelTab === "assist"}>
          <section class="right-tab-content">
            <header class="panel-header">
              <span>{tr(state.language, "assist")}</span>
              <span class="badge">{state.suggestedBoxes.length}</span>
            </header>
            <div class="control-stack">
              <label class="control-field">
                <span>{tr(state.language, "modelProfile")}</span>
                <div class="inline-control">
                  <button
                    class="panel-button"
                    type="button"
                    onClick={loadModelProfile}
                  >
                    {tr(state.language, "loadProfile")}
                  </button>
                  <button
                    class="panel-button"
                    type="button"
                    disabled={!state.onnxModelPath}
                    onClick={saveModelProfile}
                  >
                    {tr(state.language, "saveProfile")}
                  </button>
                </div>
                <span class="profile-name truncate">{profileName()}</span>
              </label>
              <label class="control-field">
                <span>{tr(state.language, "onnxModel")}</span>
                <div class="inline-control">
                  <button
                    class="panel-button"
                    type="button"
                    onClick={chooseOnnxModel}
                  >
                    {tr(state.language, "choose")}
                  </button>
                  <span
                    class="truncate muted"
                    title={state.onnxModelPath ?? ""}
                  >
                    {modelName()}
                  </span>
                </div>
              </label>
              <label class="control-field">
                <span>{tr(state.language, "inputSize")}</span>
                <input
                  type="number"
                  min="32"
                  step="32"
                  value={state.onnxInputSize}
                  onInput={(event) =>
                    setOnnxInputSize(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
              <label class="control-field">
                <span>
                  {tr(state.language, "threshold")}{" "}
                  <b>{state.onnxConfidence.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={state.onnxConfidence}
                  onInput={(event) =>
                    setOnnxConfidence(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
              <label class="control-field">
                <span>
                  {tr(state.language, "nms")} <b>{state.onnxNms.toFixed(2)}</b>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={state.onnxNms}
                  onInput={(event) =>
                    setOnnxNms(event.currentTarget.valueAsNumber)
                  }
                />
              </label>
              <div class="range-row">
                <label class="control-field">
                  <span>{tr(state.language, "classMin")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={state.onnxClassMin}
                    onInput={(event) =>
                      setOnnxClassMin(event.currentTarget.valueAsNumber)
                    }
                  />
                </label>
                <label class="control-field">
                  <span>{tr(state.language, "classMax")}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={state.onnxClassMax}
                    onInput={(event) =>
                      setOnnxClassMax(event.currentTarget.valueAsNumber)
                    }
                  />
                </label>
              </div>
              <div class="button-grid">
                <button
                  class="panel-button primary"
                  type="button"
                  disabled={
                    !state.onnxModelPath || !state.project || isRunningOnnx()
                  }
                  onClick={runCurrentImageDetection}
                >
                  {isRunningOnnx()
                    ? tr(state.language, "inferenceRunning")
                    : tr(state.language, "runCurrentImage")}
                </button>
                <button
                  class="panel-button primary"
                  type="button"
                  disabled={
                    !state.onnxModelPath || !state.project || isRunningOnnx()
                  }
                  onClick={runAllImagesDetection}
                >
                  {tr(state.language, "runAllImages")}
                </button>
                <button
                  class="panel-button"
                  type="button"
                  disabled={
                    state.suggestedBoxes.length === 0 || isRunningOnnx()
                  }
                  onClick={acceptSuggestions}
                >
                  {tr(state.language, "acceptAll")}
                </button>
                <button
                  class="panel-button"
                  type="button"
                  disabled={
                    state.suggestedBoxes.length === 0 || isRunningOnnx()
                  }
                  onClick={clearSuggestions}
                >
                  {tr(state.language, "clearSuggestions")}
                </button>
              </div>
              <Show when={onnxStatus()}>
                <p class="empty-hint compact">
                  {onnxStatus()}
                  <Show when={onnxProgress()}>
                    <span class="muted"> {onnxProgress()}</span>
                  </Show>
                </p>
              </Show>
            </div>
          </section>
        </Show>

        <Show when={state.rightPanelTab === "export"}>
          <section class="right-tab-content">
            <header class="panel-header">
              <span>{tr(state.language, "export")}</span>
            </header>
            <div class="control-stack">
              <label class="control-field">
                <span>{tr(state.language, "format")}</span>
                <select
                  value={state.outputFormat}
                  onChange={(event) =>
                    setOutputFormat(event.currentTarget.value as OutputFormat)
                  }
                >
                  <option value="yolo">
                    {tr(state.language, "outputYolo")}
                  </option>
                  <option value="coco">
                    {tr(state.language, "outputCoco")}
                  </option>
                </select>
              </label>
              <label class="control-field">
                <span>{tr(state.language, "language")}</span>
                <select
                  value={state.language}
                  onChange={(event) =>
                    setLanguage(event.currentTarget.value as Language)
                  }
                >
                  <option value="en">EN</option>
                  <option value="zh">中文</option>
                </select>
              </label>
              <label
                class={`autosave-toggle panel-toggle ${state.autoSave ? "active" : ""}`}
              >
                <span>{tr(state.language, "autosave")}</span>
                <input
                  type="checkbox"
                  checked={state.autoSave}
                  onChange={(event) => setAutoSave(event.currentTarget.checked)}
                />
                <span class="switch-track" aria-hidden="true">
                  <span class="switch-thumb" />
                </span>
              </label>
            </div>

            <section class="shortcut-panel">
              <header class="panel-header compact">
                <span>{tr(state.language, "shortcuts")}</span>
              </header>
              <div class="shortcut-grid">
                <span>D</span>
                <span>{tr(state.language, "draw")}</span>
                <span>Esc</span>
                <span>{tr(state.language, "select")}</span>
                <span>&larr; &rarr;</span>
                <span>{tr(state.language, "image")}</span>
                <span>Ctrl+S</span>
                <span>{tr(state.language, "save")}</span>
                <span>Ctrl/Cmd+Z</span>
                <span>{tr(state.language, "undo")}</span>
                <span>Ctrl/Cmd+Shift+Z</span>
                <span>{tr(state.language, "redo")}</span>
                <span>Del</span>
                <span>{tr(state.language, "delete")}</span>
              </div>
            </section>
          </section>
        </Show>
      </div>
    </aside>
  );
}

function parseModelProfile(text: string): ModelProfile {
  const value = JSON.parse(text) as Partial<ModelProfile>;
  if (value.type !== "yolo") {
    throw new Error("Only YOLO profiles are supported");
  }
  if (!value.modelPath || typeof value.modelPath !== "string") {
    throw new Error("modelPath is required");
  }

  return {
    version: 1,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name.trim()
        : profileNameFromPath(value.modelPath),
    type: "yolo",
    modelPath: value.modelPath,
    inputSize: numberOr(value.inputSize, 640),
    confidence: numberOr(value.confidence, 0.25),
    nms: numberOr(value.nms, 0.45),
    classMin: numberOr(value.classMin, 0),
    classMax: numberOr(value.classMax, 9999),
    classes: Array.isArray(value.classes)
      ? value.classes.filter((item): item is string => typeof item === "string")
      : undefined,
    classMap:
      value.classMap && typeof value.classMap === "object"
        ? value.classMap
        : undefined,
  };
}

function currentModelProfile(profilePath: string): ModelProfile {
  const classes = state.project?.classes.map((item) => item.name) ?? [];
  return {
    version: 1,
    name: state.onnxProfileName ?? profileNameFromPath(profilePath),
    type: "yolo",
    modelPath: state.onnxModelPath ?? "",
    inputSize: state.onnxInputSize,
    confidence: state.onnxConfidence,
    nms: state.onnxNms,
    classMin: state.onnxClassMin,
    classMax: state.onnxClassMax,
    classes,
    classMap: Object.fromEntries(
      classes.map((_, index) => [String(index), index]),
    ),
  };
}

function profileNameFromPath(path: string) {
  const filename = path.split(/[\\/]/).pop() ?? "model-profile";
  return filename.replace(/\.(onnx|json)$/i, "") || "model-profile";
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
