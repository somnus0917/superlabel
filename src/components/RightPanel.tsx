import { createSignal, For, Show } from "solid-js";
import {
  addClass,
  deleteBox,
  renameClass,
  selectBox,
  setActiveClass,
  state,
} from "../stores/app";
import { tr } from "../utils/i18n";

export default function RightPanel() {
  const [className, setClassName] = createSignal("");
  const [editingClassId, setEditingClassId] = createSignal<number | null>(null);
  const [editingClassName, setEditingClassName] = createSignal("");

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

  return (
    <aside class="right-panel panel">
      <section class="right-section">
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
                <span class="swatch" style={{ "background-color": item.color }} />
                <Show
                  when={editingClassId() === item.id}
                  fallback={<span class="truncate">{item.name}</span>}
                >
                  <input
                    class="class-rename-input"
                    value={editingClassName()}
                    onClick={(event) => event.stopPropagation()}
                    onInput={(event) => setEditingClassName(event.currentTarget.value)}
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
