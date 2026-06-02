import { state, setDrawMode } from "../stores/app";
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
        <span aria-hidden="true">📁</span>
        <span>{tr(state.language, "openFolders")}</span>
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
        <span aria-hidden="true">✏️</span>
        <span>{tr(state.language, "draw")}</span>
      </button>
      <button
        class={`toolbar-button mode ${state.drawMode === "select" ? "active" : ""}`}
        type="button"
        onClick={() => setDrawMode("select")}
      >
        <span aria-hidden="true">↖</span>
        <span>{tr(state.language, "select")}</span>
      </button>
      <div class="toolbar-spacer" />
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
