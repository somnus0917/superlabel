import { createSignal, For, Show } from "solid-js";
import {
  addClass,
  deleteBox,
  selectBox,
  setActiveClass,
  state,
} from "../stores/app";

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
          <span>Classes</span>
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
            placeholder="New class"
          />
          <button type="submit">+</button>
        </form>
      </section>

      <section class="right-section annotations-section">
        <header class="panel-header">
          <span>Annotations</span>
          <span class="badge">{state.currentBoxes.length}</span>
        </header>
        <div class="annotation-list">
          <Show
            when={state.currentBoxes.length > 0}
            fallback={<p class="empty-hint">No annotations yet</p>}
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
                    <span class="truncate">{item()?.name ?? `Class #${box.classId}`}</span>
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
          <span>Shortcuts</span>
        </header>
        <div class="shortcut-grid">
          <span>D</span><span>Draw</span>
          <span>Esc</span><span>Select</span>
          <span>&larr; &rarr;</span><span>Image</span>
          <span>Ctrl+S</span><span>Save</span>
          <span>Del</span><span>Delete</span>
        </div>
      </section>
    </aside>
  );
}
