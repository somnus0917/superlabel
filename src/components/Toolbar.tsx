import { Show } from "solid-js";
import { state, setDrawMode, setShapeTool } from "../stores/app";
import type { ShapeTool } from "../types";
import { tr } from "../utils/i18n";

interface Props {
  onOpenFolder: () => void;
  onSave: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function Toolbar(props: Props) {
  const currentFilename = () =>
    state.project?.images[state.project.currentIndex]?.filename ??
    tr(state.language, "noImageSelected");
  const currentPosition = () => {
    if (!state.project || state.project.images.length === 0) return "0/0";
    return `${state.project.currentIndex + 1}/${state.project.images.length}`;
  };
  const activeClass = () =>
    state.project?.classes.find((item) => item.id === state.activeClassId);

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
      <label class="toolbar-select">
        <span>{tr(state.language, "shape")}</span>
        <select
          value={state.shapeTool}
          onChange={(event) =>
            setShapeTool(event.currentTarget.value as ShapeTool)
          }
        >
          <option value="rect">{tr(state.language, "shapeRect")}</option>
          <option value="polygon">{tr(state.language, "shapePolygon")}</option>
          <option value="point">{tr(state.language, "shapePoint")}</option>
          <option value="circle">{tr(state.language, "shapeCircle")}</option>
          <option value="line">{tr(state.language, "shapeLine")}</option>
        </select>
      </label>
      <button
        class={`toolbar-button mode ${state.drawMode === "select" ? "active" : ""}`}
        type="button"
        onClick={() => setDrawMode("select")}
      >
        <span aria-hidden="true">↖</span>
        <span>{tr(state.language, "select")}</span>
      </button>
      <Show when={activeClass()}>
        <div class="active-class-indicator" title={activeClass()!.name}>
          <span
            class="active-class-dot"
            style={{ background: activeClass()!.color }}
          />
          <span class="active-class-name">{activeClass()!.name}</span>
        </div>
      </Show>
      <div class="toolbar-spacer" />
      <button
        class={`save-button ${state.dirty ? "dirty" : "saved"}`}
        type="button"
        onClick={props.onSave}
      >
        {state.dirty
          ? `● ${tr(state.language, "save")}`
          : `✓ ${tr(state.language, "saved")}`}
      </button>
    </header>
  );
}
