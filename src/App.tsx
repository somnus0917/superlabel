import { convertFileSrc } from "@tauri-apps/api/core";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import AnnotationCanvas from "./components/AnnotationCanvas";
import ImageList from "./components/ImageList";
import RightPanel from "./components/RightPanel";
import Toolbar from "./components/Toolbar";
import {
  goToImage,
  markSaved,
  openProject,
  setActiveClass,
  setAutoSave,
  setCurrentBoxes,
  setCurrentShapes,
  setLanguage,
  setOutputFormat,
  state,
} from "./stores/app";
import { parseShapes, serializeShapes } from "./utils/shapes";
import {
  parseClasses,
  parseYolo,
  serializeClasses,
  serializeYolo,
} from "./utils/yolo";
import {
  exportCocoFile,
  loadImagesFromFolder,
  pickFolder,
  readClassesFile,
  readLabelFile,
  readShapesFile,
  writeClassesFile,
  writeLabelFile,
  writeShapesFile,
} from "./utils/fs";
import { tr } from "./utils/i18n";
import type { ProjectWorkspace } from "./types";
import {
  readWorkspaces,
  rememberWorkspace,
  removeWorkspace,
} from "./utils/workspaces";

export default function App() {
  let canvasWrapperRef: HTMLDivElement | undefined;
  const [canvasSize, setCanvasSize] = createSignal({ width: 0, height: 0 });
  const [recentWorkspaces, setRecentWorkspaces] = createSignal<
    ProjectWorkspace[]
  >([]);
  const [openingWorkspaceId, setOpeningWorkspaceId] = createSignal("");
  const [workspaceError, setWorkspaceError] = createSignal("");

  const currentImage = () => state.project?.images[state.project.currentIndex];
  const currentImageSrc = () => {
    const image = currentImage();
    if (!image) return "";
    return convertFileSrc(image.fullPath);
  };

  async function handleSave() {
    const project = state.project;
    if (!project) return;
    const image = project.images[project.currentIndex];
    if (!image) return;
    await writeLabelFile(
      project.labelFolderPath,
      image.filename,
      serializeYolo(state.currentBoxes),
    );
    await writeShapesFile(
      project.labelFolderPath,
      image.filename,
      serializeShapes(state.currentShapes),
    );
    await writeClassesFile(
      project.labelFolderPath,
      serializeClasses(project.classes),
    );
    if (state.outputFormat === "coco") {
      await exportCocoFile(
        project.labelFolderPath,
        project.images,
        project.classes,
        image.filename,
        state.currentBoxes,
      );
    }
    markSaved(image.filename);
  }

  async function saveIfDirty() {
    if (state.dirty) {
      await handleSave();
    }
  }

  async function handleSelectImage(index: number) {
    if (!state.project || index === state.project.currentIndex) return;
    await saveIfDirty();
    goToImage(index);
  }

  async function handlePrev() {
    if (!state.project || state.project.images.length === 0) return;
    await handleSelectImage(Math.max(0, state.project.currentIndex - 1));
  }

  async function handleNext() {
    if (!state.project || state.project.images.length === 0) return;
    await handleSelectImage(
      Math.min(state.project.images.length - 1, state.project.currentIndex + 1),
    );
  }

  async function handleOpenFolder() {
    await saveIfDirty();
    const imageFolderPath = await pickFolder(
      tr(state.language, "dialogOpenImageFolder"),
    );
    if (!imageFolderPath) return;
    const labelFolderPath = await pickFolder(
      tr(state.language, "dialogOpenLabelFolder"),
    );
    if (!labelFolderPath) return;
    await openProjectFromFolders(imageFolderPath, labelFolderPath);
  }

  async function openProjectFromFolders(
    imageFolderPath: string,
    labelFolderPath: string,
    currentImageFilename?: string,
    fallbackIndex = 0,
  ) {
    const [images, classesText] = await Promise.all([
      loadImagesFromFolder(imageFolderPath, labelFolderPath),
      readClassesFile(labelFolderPath),
    ]);
    const rememberedIndex = currentImageFilename
      ? images.findIndex((image) => image.filename === currentImageFilename)
      : -1;
    const firstUnannotated = images.findIndex((image) => !image.annotated);
    const currentIndex =
      rememberedIndex >= 0
        ? rememberedIndex
        : firstUnannotated >= 0
          ? firstUnannotated
          : Math.max(0, Math.min(fallbackIndex, images.length - 1));
    openProject({
      imageFolderPath,
      labelFolderPath,
      images,
      currentIndex,
      classes: parseClasses(classesText),
    });
  }

  async function handleOpenWorkspace(workspace: ProjectWorkspace) {
    await saveIfDirty();
    setOpeningWorkspaceId(workspace.id);
    setWorkspaceError("");
    try {
      setAutoSave(workspace.autoSave);
      setOutputFormat(workspace.outputFormat);
      setLanguage(workspace.language);
      await openProjectFromFolders(
        workspace.imageFolderPath,
        workspace.labelFolderPath,
        workspace.currentImageFilename,
        workspace.currentIndex,
      );
    } catch (error) {
      setWorkspaceError(String(error));
    } finally {
      setOpeningWorkspaceId("");
    }
  }

  async function handleRemoveWorkspace(id: string) {
    setRecentWorkspaces(await removeWorkspace(id));
  }

  function handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    if (!isInput && /^[1-9]$/.test(event.key)) {
      const classIndex = Number(event.key) - 1;
      const classes = state.project?.classes;
      if (classes && classIndex < classes.length) {
        setActiveClass(classes[classIndex].id);
      }
    }
    if (!isInput && event.key === "0") {
      const classes = state.project?.classes;
      if (classes && classes.length >= 10) {
        setActiveClass(classes[9].id);
      }
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      void handlePrev();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      void handleNext();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void handleSave();
    }
  }

  onMount(() => {
    void (async () => {
      setRecentWorkspaces(await readWorkspaces());
    })();
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ width, height });
    });
    if (canvasWrapperRef) {
      observer.observe(canvasWrapperRef);
    }
    window.addEventListener("keydown", handleKeydown);
    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("keydown", handleKeydown);
    });
  });

  createEffect(() => {
    const project = state.project;
    const index = project?.currentIndex;
    const image =
      project && typeof index === "number" ? project.images[index] : undefined;
    if (!project || !image) {
      setCurrentBoxes([]);
      setCurrentShapes([]);
      return;
    }
    void (async () => {
      const [labelText, shapesText] = await Promise.all([
        readLabelFile(project.labelFolderPath, image.filename),
        readShapesFile(project.labelFolderPath, image.filename),
      ]);
      if (
        state.project?.imageFolderPath === project.imageFolderPath &&
        state.project.labelFolderPath === project.labelFolderPath &&
        state.project.currentIndex === index
      ) {
        setCurrentBoxes(parseYolo(labelText), image.filename);
        setCurrentShapes(parseShapes(shapesText));
      }
    })();
  });

  createEffect(() => {
    const project = state.project;
    const currentIndex = project?.currentIndex;
    const currentImage = project?.images[currentIndex ?? 0];
    state.autoSave;
    state.outputFormat;
    state.language;
    currentImage?.filename;

    if (!project || currentIndex === undefined) return;
    void (async () => {
      setRecentWorkspaces(
        await rememberWorkspace({
          project,
          autoSave: state.autoSave,
          outputFormat: state.outputFormat,
          language: state.language,
        }),
      );
    })();
  });

  createEffect(() => {
    if (!state.autoSave || !state.dirty) return;
    const project = state.project;
    const image = project?.images[project.currentIndex];
    if (!project || !image) return;

    state.currentBoxes.length;
    state.currentShapes.length;
    project.classes.length;

    const saveTimer = window.setTimeout(() => {
      void handleSave();
    }, 600);

    onCleanup(() => {
      window.clearTimeout(saveTimer);
    });
  });

  return (
    <div class="app">
      <Toolbar
        onOpenFolder={handleOpenFolder}
        onSave={handleSave}
        onPrev={handlePrev}
        onNext={handleNext}
      />
      <main class="workspace">
        <ImageList onSelectImage={handleSelectImage} />
        <section ref={canvasWrapperRef} class="canvas-shell">
          <Show
            when={state.project && currentImageSrc()}
            fallback={
              <EmptyState
                onOpenFolder={handleOpenFolder}
                recentWorkspaces={recentWorkspaces()}
                openingWorkspaceId={openingWorkspaceId()}
                workspaceError={workspaceError()}
                onOpenWorkspace={handleOpenWorkspace}
                onRemoveWorkspace={handleRemoveWorkspace}
              />
            }
          >
            <AnnotationCanvas
              imageSrc={currentImageSrc()}
              containerWidth={canvasSize().width}
              containerHeight={canvasSize().height}
            />
          </Show>
        </section>
        <RightPanel />
      </main>
    </div>
  );
}

function EmptyState(props: {
  onOpenFolder: () => void;
  recentWorkspaces: ProjectWorkspace[];
  openingWorkspaceId: string;
  workspaceError: string;
  onOpenWorkspace: (workspace: ProjectWorkspace) => void;
  onRemoveWorkspace: (id: string) => void;
}) {
  return (
    <div class="empty-state">
      <div class="empty-state-content">
        <h1>superlabel</h1>
        <p>{tr(state.language, "emptyDescription")}</p>
        <button type="button" onClick={props.onOpenFolder}>
          {tr(state.language, "openFolders")}
        </button>
        <Show when={props.workspaceError}>
          <p class="workspace-error">
            {tr(state.language, "workspaceOpenFailed")}: {props.workspaceError}
          </p>
        </Show>
        <Show when={props.recentWorkspaces.length > 0}>
          <section class="recent-workspaces">
            <header>{tr(state.language, "recentWorkspaces")}</header>
            <div class="workspace-list">
              <For each={props.recentWorkspaces}>
                {(workspace) => (
                  <div class="workspace-row">
                    <button
                      type="button"
                      class="workspace-open"
                      disabled={Boolean(props.openingWorkspaceId)}
                      onClick={() => props.onOpenWorkspace(workspace)}
                    >
                      <span class="workspace-title">
                        {workspace.name}
                        <Show when={props.openingWorkspaceId === workspace.id}>
                          <span class="muted">
                            {" "}
                            {tr(state.language, "openingWorkspace")}
                          </span>
                        </Show>
                      </span>
                      <span class="workspace-path truncate">
                        {workspace.imageFolderPath}
                      </span>
                      <span class="workspace-meta">
                        {workspace.currentImageFilename ??
                          tr(state.language, "noImageSelected")}{" "}
                        · {formatWorkspaceTime(workspace.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="workspace-remove"
                      title={tr(state.language, "removeWorkspace")}
                      onClick={() => props.onRemoveWorkspace(workspace.id)}
                    >
                      x
                    </button>
                  </div>
                )}
              </For>
            </div>
          </section>
        </Show>
      </div>
    </div>
  );
}

function formatWorkspaceTime(value: number) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}
