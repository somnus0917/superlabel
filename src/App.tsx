import { convertFileSrc } from "@tauri-apps/api/core";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import AnnotationCanvas from "./components/AnnotationCanvas";
import ImageList from "./components/ImageList";
import RightPanel from "./components/RightPanel";
import Toolbar from "./components/Toolbar";
import {
  goToImage,
  markSaved,
  openProject,
  setCurrentBoxes,
  state,
} from "./stores/app";
import { parseClasses, parseYolo, serializeClasses, serializeYolo } from "./utils/yolo";
import {
  loadImagesFromFolder,
  pickFolder,
  readClassesFile,
  readLabelFile,
  writeClassesFile,
  writeLabelFile,
} from "./utils/fs";
import { tr } from "./utils/i18n";

export default function App() {
  let canvasWrapperRef: HTMLDivElement | undefined;
  const [canvasSize, setCanvasSize] = createSignal({ width: 0, height: 0 });

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
    await writeLabelFile(project.labelFolderPath, image.filename, serializeYolo(state.currentBoxes));
    await writeClassesFile(project.labelFolderPath, serializeClasses(project.classes));
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
    await handleSelectImage(Math.min(state.project.images.length - 1, state.project.currentIndex + 1));
  }

  async function handleOpenFolder() {
    await saveIfDirty();
    const imageFolderPath = await pickFolder(tr(state.language, "dialogOpenImageFolder"));
    if (!imageFolderPath) return;
    const labelFolderPath = await pickFolder(tr(state.language, "dialogOpenLabelFolder"));
    if (!labelFolderPath) return;
    const [images, classesText] = await Promise.all([
      loadImagesFromFolder(imageFolderPath, labelFolderPath),
      readClassesFile(labelFolderPath),
    ]);
    openProject({
      imageFolderPath,
      labelFolderPath,
      images,
      currentIndex: 0,
      classes: parseClasses(classesText),
    });
  }

  function handleKeydown(event: KeyboardEvent) {
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
    const image = project && typeof index === "number" ? project.images[index] : undefined;
    if (!project || !image) {
      setCurrentBoxes([]);
      return;
    }
    void (async () => {
      const text = await readLabelFile(project.labelFolderPath, image.filename);
      if (
        state.project?.imageFolderPath === project.imageFolderPath &&
        state.project.labelFolderPath === project.labelFolderPath &&
        state.project.currentIndex === index
      ) {
        setCurrentBoxes(parseYolo(text));
      }
    })();
  });

  createEffect(() => {
    const project = state.project;
    const image = project?.images[project.currentIndex];
    const boxesSignature = state.currentBoxes
      .map((box) => `${box.id}:${box.classId}:${box.cx}:${box.cy}:${box.w}:${box.h}`)
      .join("|");
    const classesSignature = project?.classes.map((item) => `${item.id}:${item.name}`).join("|");
    state.autoSave;
    state.dirty;
    boxesSignature;
    classesSignature;

    if (!state.autoSave || !state.dirty || !project || !image) return;

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
            fallback={<EmptyState onOpenFolder={handleOpenFolder} />}
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

function EmptyState(props: { onOpenFolder: () => void }) {
  return (
    <div class="empty-state">
      <div>
        <h1>superlabel</h1>
        <p>{tr(state.language, "emptyDescription")}</p>
        <button type="button" onClick={props.onOpenFolder}>
          {tr(state.language, "openFolders")}
        </button>
      </div>
    </div>
  );
}
