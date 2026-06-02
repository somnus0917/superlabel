import { state, setAutoSave, setDrawMode, setLanguage, setOutputFormat } from "../stores/app";
import type { Language, OutputFormat } from "../types";
import { tr } from "../utils/i18n";

interface Props {
  onOpenFolder: () => void;
  onSave: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function Toolbar(props: Props) {
  const currentFilename = () =>
    state.project?.images[state.project.currentIndex]?.filename ?? tr(state.language, "noImageSelected");
  const currentPosition = () => {
    if (!state.project || state.project.images.length === 0) return "0/0";
    return `${state.project.currentIndex + 1}/${state.project.images.length}`;
  };

  return (
    <header class="toolbar">
      <button class="toolbar-button" type="button" onClick={props.onOpenFolder}>
        <span aria-hidden="true">📁</span> {tr(state.language, "openFolders")}
      </button>
      <div class="toolbar-separator" />
      <button class="icon-button" type="button" onClick={props.onPrev}>
        ‹
      </button>
      <div class="current-file" title={currentFilename()}>
        <span>{currentFilename()}</span>
        <span class="count">{currentPosition()}</span>
      </div>
      <button class="icon-button" type="button" onClick={props.onNext}>
        ›
      </button>
      <div class="toolbar-separator" />
      <button
        class={`toolbar-button mode ${state.drawMode === "draw" ? "active" : ""}`}
        type="button"
        onClick={() => setDrawMode("draw")}
      >
        ✏️ {tr(state.language, "draw")}
      </button>
      <button
        class={`toolbar-button mode ${state.drawMode === "select" ? "active" : ""}`}
        type="button"
        onClick={() => setDrawMode("select")}
      >
        ↖ {tr(state.language, "select")}
      </button>
      <div class="toolbar-spacer" />
      <label class="toolbar-select">
        <span>{tr(state.language, "format")}</span>
        <select
          value={state.outputFormat}
          onChange={(event) => setOutputFormat(event.currentTarget.value as OutputFormat)}
        >
          <option value="yolo">{tr(state.language, "outputYolo")}</option>
          <option value="coco">{tr(state.language, "outputCoco")}</option>
        </select>
      </label>
      <label class="toolbar-select">
        <span>{tr(state.language, "language")}</span>
        <select
          value={state.language}
          onChange={(event) => setLanguage(event.currentTarget.value as Language)}
        >
          <option value="en">EN</option>
          <option value="zh">中文</option>
        </select>
      </label>
      <label class={`autosave-toggle ${state.autoSave ? "active" : ""}`}>
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
        class={`save-button ${state.dirty ? "dirty" : "saved"}`}
        type="button"
        onClick={props.onSave}
      >
        {state.dirty ? `● ${tr(state.language, "save")}` : `✓ ${tr(state.language, "saved")}`}
      </button>
    </header>
  );
}
