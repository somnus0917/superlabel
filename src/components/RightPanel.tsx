import { createSignal, For, Show } from "solid-js";
import {
  addClass,
  deleteBox,
  selectBox,
  setActiveClass,
  state,
} from "../stores/app";
import { tr } from "../utils/i18n";

export default function RightPanel() {
  const [className, setClassName] = createSignal("");

  function submitClass(event: SubmitEvent) {
    event.preventDefault();
    addClass(className());
    setClassName("");
  }

  function classForId(id: number) {
    return state.project?.classes.find((item) => item.id === id);
  }

  return (
    <aside class="right-panel panel">
      <section class="right-section">
        <header class="panel-header">
          <span>{tr(state.language, "classes")}</span>
        </header>
        <div class="class-list">
          <For each={state.project?.classes ?? []}>
            {(item) => (
              <button
                class={`class-row ${state.activeClassId === item.id ? "active" : ""}`}
                type="button"
                onClick={() => setActiveClass(item.id)}
              >
                <span class="swatch" style={{ "background-color": item.color }} />
                <span class="truncate">{item.name}</span>
                <span class="muted">#{item.id}</span>
              </button>
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

      <section class="right-section annotations-section">
        <header class="panel-header">
          <span>{tr(state.language, "annotations")}</span>
          <span class="badge">{state.currentBoxes.length}</span>
        </header>
        <div class="annotation-list">
          <Show
            when={state.currentBoxes.length > 0}
            fallback={<p class="empty-hint">{tr(state.language, "noAnnotations")}</p>}
          >
            <For each={state.currentBoxes}>
              {(box) => {
                const item = () => classForId(box.classId);
                return (
                  <button
                    class={`annotation-row ${state.selectedBoxId === box.id ? "active" : ""}`}
                    type="button"
                    onClick={() => selectBox(box.id)}
                    >
                    <span class="swatch" style={{ "background-color": item()?.color ?? "#4a9eff" }} />
                    <span class="truncate">{item()?.name ?? `${tr(state.language, "classPrefix")} #${box.classId}`}</span>
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
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </section>

      <section class="right-section shortcuts-section">
        <header class="panel-header">
          <span>{tr(state.language, "shortcuts")}</span>
        </header>
        <div class="shortcut-grid">
          <span>D</span><span>{tr(state.language, "draw")}</span>
          <span>Esc</span><span>{tr(state.language, "select")}</span>
          <span>&larr; &rarr;</span><span>{tr(state.language, "image")}</span>
          <span>Ctrl+S</span><span>{tr(state.language, "save")}</span>
          <span>Del</span><span>{tr(state.language, "delete")}</span>
        </div>
      </section>
    </aside>
  );
}
