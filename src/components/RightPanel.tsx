import { listen } from "@tauri-apps/api/event";
import { createEffect, createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import {
  addClass,
  acceptSuggestedBoxes,
  applyModelProfile,
  clearSuggestedBoxes,
  deleteBox,
  deleteShape,
  renameClass,
  selectBox,
  selectShape,
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
  updateShape,
} from "../stores/app";
import type {
  Language,
  ModelProfile,
  OutputFormat,
  ProjectStats,
  RightPanelTab,
  ShapeTool,
} from "../types";
import {
  computeProjectStats,
  downloadModelFile,
  pickModelProfile,
  pickModelProfileSavePath,
  pickOnnxModel,
  pickPresetModelSavePath,
  readTextFile,
  runOnnxDetection,
  writeTextFile,
} from "../utils/fs";
import { generateDataYaml } from "../utils/dataYaml";
import { tr } from "../utils/i18n";
import { MODEL_PRESETS } from "../utils/modelPresets";

const PANEL_TABS: RightPanelTab[] = [
  "classes",
  "annotations",
  "stats",
  "assist",
  "export",
];

interface DownloadProgress {
  id: string;
  downloaded: number;
  total?: number;
  done: boolean;
}

type OnnxRunMode = "idle" | "current" | "all";

export default function RightPanel() {
  const [className, setClassName] = createSignal("");
  const [editingClassId, setEditingClassId] = createSignal<number | null>(null);
  const [editingClassName, setEditingClassName] = createSignal("");
  const [isRunningOnnx, setIsRunningOnnx] = createSignal(false);
  const [onnxStatus, setOnnxStatus] = createSignal("");
  const [onnxProgress, setOnnxProgress] = createSignal("");
  const [selectedPresetId, setSelectedPresetId] = createSignal(
    MODEL_PRESETS[0]?.id ?? "",
  );
  const [isDownloadingPreset, setIsDownloadingPreset] = createSignal(false);
  const [downloadProgress, setDownloadProgress] = createSignal(0);
  const [downloadProgressText, setDownloadProgressText] = createSignal("");
  const [onnxProgressRatio, setOnnxProgressRatio] = createSignal(0);
  const [onnxRunMode, setOnnxRunMode] = createSignal<OnnxRunMode>("idle");
  const [projectStats, setProjectStats] = createSignal<ProjectStats | null>(
    null,
  );
  const [isLoadingStats, setIsLoadingStats] = createSignal(false);
  const [statsError, setStatsError] = createSignal("");
  const [dataYamlStatus, setDataYamlStatus] = createSignal("");
  let statsRequestId = 0;
  let dataYamlStatusTimer = 0;
  let cancelAllDetection = false;

  createEffect(() => {
    if (state.rightPanelTab !== "stats") return;
    const project = state.project;
    if (!project) {
      setProjectStats(null);
      return;
    }

    const currentImage = project.images[project.currentIndex];
    const currentBoxes = state.currentBoxes.map((box) => ({
      id: box.id,
      cx: box.cx,
      cy: box.cy,
      w: box.w,
      h: box.h,
      classId: box.classId,
    }));
    project.labelFolderPath;
    project.images.length;
    project.classes.length;
    currentBoxes.length;

    void refreshProjectStats(currentImage?.filename ?? "", currentBoxes);
  });

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

  async function refreshProjectStats(
    currentImageFilename?: string,
    currentBoxes = state.currentBoxes,
  ) {
    const project = state.project;
    if (!project) return;

    const requestId = ++statsRequestId;
    setIsLoadingStats(true);
    setStatsError("");
    try {
      const stats = await computeProjectStats(
        project.labelFolderPath,
        project.images.map((image) => ({ ...image })),
        project.classes.map((item) => ({ ...item })),
        currentImageFilename ??
          project.images[project.currentIndex]?.filename ??
          "",
        currentBoxes.map((box) => ({ ...box })),
      );
      if (requestId === statsRequestId) {
        setProjectStats(stats);
      }
    } catch (error) {
      if (requestId === statsRequestId) {
        setStatsError(String(error));
      }
    } finally {
      if (requestId === statsRequestId) {
        setIsLoadingStats(false);
      }
    }
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

  async function generateDataYamlFile() {
    const project = state.project;
    if (!project) return;

    const content = generateDataYaml(project.imageFolderPath, project.classes);
    await writeTextFile(`${project.labelFolderPath}/data.yaml`, `${content}\n`);
    window.clearTimeout(dataYamlStatusTimer);
    setDataYamlStatus("✓ data.yaml saved");
    dataYamlStatusTimer = window.setTimeout(() => {
      setDataYamlStatus("");
    }, 1800);
  }

  function modelName() {
    if (!state.onnxModelPath) return tr(state.language, "noOnnxModel");
    return state.onnxModelPath.split(/[\\/]/).pop() ?? state.onnxModelPath;
  }

  function profileName() {
    return state.onnxProfileName ?? tr(state.language, "unsavedProfile");
  }

  function selectedPreset() {
    return MODEL_PRESETS.find((preset) => preset.id === selectedPresetId());
  }

  async function downloadSelectedPreset() {
    const preset = selectedPreset();
    if (!preset || isDownloadingPreset()) return;
    const destinationPath = await pickPresetModelSavePath(
      tr(state.language, "dialogSavePresetModel"),
      preset.filename,
    );
    if (!destinationPath) return;

    setIsDownloadingPreset(true);
    setDownloadProgress(0);
    setDownloadProgressText("");
    setOnnxStatus(`${tr(state.language, "downloadingModel")}: ${preset.name}`);
    const progressId = `${preset.id}-${Date.now()}`;
    const unlisten = await listen<DownloadProgress>(
      "model-download-progress",
      (event) => {
        if (event.payload.id !== progressId) return;
        const { downloaded, total } = event.payload;
        if (total && total > 0) {
          setDownloadProgress(Math.min(1, downloaded / total));
          setDownloadProgressText(
            `${formatBytes(downloaded)} / ${formatBytes(total)}`,
          );
        } else {
          setDownloadProgress(0);
          setDownloadProgressText(formatBytes(downloaded));
        }
      },
    );
    try {
      const modelPath = await downloadModelFile(
        preset.url,
        destinationPath,
        progressId,
      );
      applyModelProfile({
        version: 1,
        name: preset.name,
        type: "yolo",
        modelPath,
        inputSize: preset.inputSize,
        confidence: state.onnxConfidence,
        nms: state.onnxNms,
        classMin: preset.classMin,
        classMax: preset.classMax,
      });
      setOnnxStatus(`${tr(state.language, "modelDownloaded")}: ${preset.name}`);
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "downloadFailed")}: ${String(error)}`,
      );
    } finally {
      unlisten();
      setIsDownloadingPreset(false);
      setDownloadProgress(0);
      setDownloadProgressText("");
    }
  }

  async function runCurrentImageDetection() {
    const project = state.project;
    const image = project?.images[project.currentIndex];
    if (!state.onnxModelPath || !image || isRunningOnnx()) return;

    setIsRunningOnnx(true);
    setOnnxRunMode("current");
    setOnnxStatus(
      `${tr(state.language, "prelabelingCurrent")}: ${image.filename}`,
    );
    setOnnxProgress("1/1");
    setOnnxProgressRatio(0);
    try {
      await waitForNextPaint();
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
      setOnnxProgressRatio(1);
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "inferenceFailed")}: ${String(error)}`,
      );
    } finally {
      setIsRunningOnnx(false);
      setOnnxRunMode("idle");
      window.setTimeout(() => {
        setOnnxProgress("");
        setOnnxProgressRatio(0);
      }, 400);
    }
  }

  async function runAllImagesDetection() {
    const project = state.project;
    if (!state.onnxModelPath || !project || isRunningOnnx()) return;

    cancelAllDetection = false;
    setIsRunningOnnx(true);
    setOnnxRunMode("all");
    setOnnxStatus(tr(state.language, "prelabelingAll"));
    setOnnxProgress(`0/${project.images.length}`);
    setOnnxProgressRatio(0);
    try {
      await waitForNextPaint();
      let totalBoxes = 0;
      let processedImages = 0;
      for (const [index, image] of project.images.entries()) {
        if (cancelAllDetection) break;
        setOnnxProgress(`${index + 1}/${project.images.length}`);
        setOnnxProgressRatio(index / project.images.length);
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
        processedImages += 1;
        setSuggestedBoxes(boxes, image.filename);
        setOnnxProgressRatio((index + 1) / project.images.length);
      }
      if (cancelAllDetection) {
        setOnnxStatus(
          `${tr(state.language, "cancelled")}: ${processedImages}/${project.images.length}, ${totalBoxes} ${tr(state.language, "suggestionsReady")}`,
        );
      } else {
        setOnnxStatus(
          `${project.images.length} ${tr(state.language, "imagesProcessed")}, ${totalBoxes} ${tr(state.language, "suggestionsReady")}`,
        );
      }
    } catch (error) {
      setOnnxStatus(
        `${tr(state.language, "inferenceFailed")}: ${String(error)}`,
      );
    } finally {
      setIsRunningOnnx(false);
      setOnnxRunMode("idle");
      window.setTimeout(() => {
        setOnnxProgress("");
        setOnnxProgressRatio(0);
      }, 400);
    }
  }

  function cancelDetection() {
    cancelAllDetection = true;
    setOnnxStatus(tr(state.language, "cancelling"));
  }

  function tabLabel(tab: RightPanelTab) {
    if (tab === "classes") return tr(state.language, "classes");
    if (tab === "annotations") return tr(state.language, "annotations");
    if (tab === "stats") return tr(state.language, "stats");
    if (tab === "assist") return tr(state.language, "assist");
    return tr(state.language, "export");
  }

  function shapeLabel(kind: ShapeTool) {
    if (kind === "polygon") return tr(state.language, "shapePolygon");
    if (kind === "point") return tr(state.language, "shapePoint");
    if (kind === "circle") return tr(state.language, "shapeCircle");
    if (kind === "line") return tr(state.language, "shapeLine");
    return tr(state.language, "shapeRect");
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

  function changeShapeClass(shapeId: string, classId: number) {
    selectShape(shapeId);
    updateShape(shapeId, { classId });
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
              <span class="badge">
                {state.currentBoxes.length + state.currentShapes.length}
              </span>
            </header>
            <div class="annotation-list">
              <Show
                when={
                  state.currentBoxes.length + state.currentShapes.length > 0
                }
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
                <For each={state.currentShapes}>
                  {(shape) => {
                    const item = () => classForId(shape.classId);
                    return (
                      <div
                        class={`annotation-row ${state.selectedShapeId === shape.id ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectShape(shape.id)}
                      >
                        <span
                          class="swatch"
                          style={{
                            "background-color": item()?.color ?? "#4a9eff",
                          }}
                        />
                        <span class="shape-kind">{shapeLabel(shape.kind)}</span>
                        <select
                          class="annotation-class-select"
                          value={shape.classId}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            changeShapeClass(
                              shape.id,
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
                            <option value={shape.classId}>
                              {tr(state.language, "classPrefix")} #
                              {shape.classId}
                            </option>
                          </Show>
                        </select>
                        <span
                          class="delete-button"
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteShape(shape.id);
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

        <Show when={state.rightPanelTab === "stats"}>
          <section class="right-tab-content">
            <header class="panel-header">
              <span>{tr(state.language, "stats")}</span>
              <button
                class={`refresh-button ${isLoadingStats() ? "is-loading" : ""}`}
                type="button"
                aria-busy={isLoadingStats()}
                disabled={!state.project || isLoadingStats()}
                onClick={() => void refreshProjectStats()}
              >
                {tr(state.language, "refresh")}
              </button>
            </header>
            <Show
              when={state.project}
              fallback={
                <p class="empty-hint">{tr(state.language, "noImages")}</p>
              }
            >
              <Show
                when={!statsError()}
                fallback={
                  <p class="empty-hint compact">
                    {tr(state.language, "statsFailed")}: {statsError()}
                  </p>
                }
              >
                <Show
                  when={projectStats()}
                  fallback={
                    <p class="empty-hint">
                      {tr(state.language, "statsLoading")}
                    </p>
                  }
                >
                  {(stats) => (
                    <div class="stats-panel">
                      <div class="stats-summary-grid">
                        <StatCard
                          label={tr(state.language, "annotatedImages")}
                          value={`${stats().annotatedImages}/${stats().totalImages}`}
                        />
                        <StatCard
                          label={tr(state.language, "unannotatedImages")}
                          value={String(stats().unannotatedImages)}
                        />
                        <StatCard
                          label={tr(state.language, "totalBoxes")}
                          value={String(stats().totalBoxes)}
                        />
                        <StatCard
                          label={tr(state.language, "estimatedRemaining")}
                          value={formatMinutes(
                            stats().estimatedRemainingMinutes,
                          )}
                        />
                      </div>

                      <StatsBlock
                        title={tr(state.language, "classDistribution")}
                      >
                        <Show
                          when={stats().classCounts.length > 0}
                          fallback={
                            <p class="empty-hint compact">
                              {tr(state.language, "noClassStats")}
                            </p>
                          }
                        >
                          <div class="bar-list">
                            <For each={stats().classCounts}>
                              {(item) => (
                                <ChartBar
                                  label={`#${item.classId} ${item.name}`}
                                  value={item.count}
                                  max={maxClassCount(stats())}
                                  color={item.color}
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </StatsBlock>

                      <StatsBlock title={tr(state.language, "bboxQuality")}>
                        <div class="metric-grid">
                          <StatCard
                            label={tr(state.language, "avgBoxSize")}
                            value={`${formatPercent(stats().avgBboxArea)}`}
                          />
                          <StatCard
                            label={tr(state.language, "avgBoxWidth")}
                            value={formatPercent(stats().avgBboxWidth)}
                          />
                          <StatCard
                            label={tr(state.language, "avgBoxHeight")}
                            value={formatPercent(stats().avgBboxHeight)}
                          />
                          <StatCard
                            label={tr(state.language, "avgAspectRatio")}
                            value={formatNumber(stats().avgAspectRatio)}
                          />
                        </div>
                      </StatsBlock>

                      <StatsBlock
                        title={tr(state.language, "aspectRatioDistribution")}
                      >
                        <Show
                          when={stats().totalBoxes > 0}
                          fallback={
                            <p class="empty-hint compact">
                              {tr(state.language, "noBboxStats")}
                            </p>
                          }
                        >
                          <div class="bar-list compact">
                            <For each={stats().aspectRatioBins}>
                              {(bin) => (
                                <ChartBar
                                  label={aspectRatioLabel(bin.key)}
                                  value={bin.count}
                                  max={maxAspectRatioCount(stats())}
                                  color="#88ccff"
                                />
                              )}
                            </For>
                          </div>
                        </Show>
                      </StatsBlock>
                    </div>
                  )}
                </Show>
              </Show>
            </Show>
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
                <span>{tr(state.language, "presetModel")}</span>
                <div class="inline-control">
                  <select
                    value={selectedPresetId()}
                    onChange={(event) =>
                      setSelectedPresetId(event.currentTarget.value)
                    }
                  >
                    <For each={MODEL_PRESETS}>
                      {(preset) => (
                        <option value={preset.id}>
                          {preset.group} / {preset.name}
                        </option>
                      )}
                    </For>
                  </select>
                  <button
                    class="panel-button"
                    type="button"
                    disabled={!selectedPreset() || isDownloadingPreset()}
                    onClick={downloadSelectedPreset}
                  >
                    {isDownloadingPreset()
                      ? tr(state.language, "downloading")
                      : tr(state.language, "download")}
                  </button>
                </div>
                <Show when={selectedPreset()?.note}>
                  <span class="profile-name truncate">
                    {selectedPreset()?.note}
                  </span>
                </Show>
                <Show when={isDownloadingPreset()}>
                  <ProgressBar
                    value={downloadProgress()}
                    label={downloadProgressText()}
                  />
                </Show>
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
                  class={`panel-button primary${onnxRunMode() === "current" ? " is-loading" : ""}`}
                  type="button"
                  aria-busy={onnxRunMode() === "current"}
                  disabled={
                    !state.onnxModelPath || !state.project || isRunningOnnx()
                  }
                  onClick={runCurrentImageDetection}
                >
                  {onnxRunMode() === "current"
                    ? tr(state.language, "prelabeling")
                    : tr(state.language, "runCurrentImage")}
                </button>
                <button
                  class={`panel-button primary${onnxRunMode() === "all" ? " is-loading" : ""}`}
                  type="button"
                  aria-busy={onnxRunMode() === "all"}
                  disabled={
                    !state.onnxModelPath ||
                    !state.project ||
                    (isRunningOnnx() && onnxRunMode() !== "all")
                  }
                  onClick={
                    onnxRunMode() === "all"
                      ? cancelDetection
                      : runAllImagesDetection
                  }
                >
                  {onnxRunMode() === "all"
                    ? tr(state.language, "cancel")
                    : tr(state.language, "runAllImages")}
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
              <Show when={isRunningOnnx() || onnxProgressRatio() > 0}>
                <ProgressBar
                  value={onnxProgressRatio()}
                  label={onnxProgress()}
                  indeterminate={isRunningOnnx() && onnxRunMode() === "current"}
                />
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
              <button
                class="panel-button primary"
                type="button"
                disabled={!state.project}
                onClick={generateDataYamlFile}
              >
                {tr(state.language, "generateDataYaml")}
              </button>
              <Show when={dataYamlStatus()}>
                <p class="empty-hint compact">{dataYamlStatus()}</p>
              </Show>
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
                <span>1-9, 0</span>
                <span>{tr(state.language, "switchClass")}</span>
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

function StatsBlock(props: { title: string; children: JSX.Element }) {
  return (
    <section class="stats-block">
      <header>{props.title}</header>
      {props.children}
    </section>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <div class="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function ChartBar(props: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = () =>
    `${props.max > 0 ? Math.max(4, (props.value / props.max) * 100) : 0}%`;
  return (
    <div class="chart-bar-row">
      <div class="chart-bar-meta">
        <span class="truncate">{props.label}</span>
        <b>{props.value}</b>
      </div>
      <div class="chart-bar-track" aria-hidden="true">
        <div
          class="chart-bar-fill"
          style={{
            width: width(),
            "background-color": props.color,
          }}
        />
      </div>
    </div>
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

function maxClassCount(stats: ProjectStats) {
  return Math.max(0, ...stats.classCounts.map((item) => item.count));
}

function maxAspectRatioCount(stats: ProjectStats) {
  return Math.max(0, ...stats.aspectRatioBins.map((item) => item.count));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function formatNumber(value: number) {
  return value > 0 ? value.toFixed(2) : "-";
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function aspectRatioLabel(key: string) {
  if (key === "veryTall") return tr(state.language, "aspectVeryTall");
  if (key === "tall") return tr(state.language, "aspectTall");
  if (key === "square") return tr(state.language, "aspectSquare");
  if (key === "wide") return tr(state.language, "aspectWide");
  return tr(state.language, "aspectVeryWide");
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      window.setTimeout(resolve, 0);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function ProgressBar(props: {
  value: number;
  label?: string;
  indeterminate?: boolean;
}) {
  const percent = () =>
    `${Math.round(Math.max(0, Math.min(1, props.value)) * 100)}%`;
  return (
    <div class="progress-row">
      <div class="progress-track" aria-hidden="true">
        <div
          class={`progress-fill${props.indeterminate ? " indeterminate" : ""}`}
          style={{ width: props.indeterminate ? "38%" : percent() }}
        />
      </div>
      <span class="progress-label">{props.label || percent()}</span>
    </div>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
