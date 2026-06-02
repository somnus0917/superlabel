import { For, Show } from "solid-js";
import { state } from "../stores/app";
import { tr } from "../utils/i18n";

interface Props {
  onSelectImage: (index: number) => void;
}

export default function ImageList(props: Props) {
  const annotatedCount = () => state.project?.images.filter((item) => item.annotated).length ?? 0;
  const totalCount = () => state.project?.images.length ?? 0;

  return (
    <aside class="image-list panel">
      <header class="panel-header">
        <span>{tr(state.language, "images")}</span>
        <span class="count">{annotatedCount()}/{totalCount()}</span>
      </header>
      <div class="image-rows">
        <Show when={state.project?.images.length} fallback={<p class="empty-hint">{tr(state.language, "noImages")}</p>}>
          <For each={state.project?.images ?? []}>
            {(image, index) => (
              <button
                class={`image-row ${state.project?.currentIndex === index() ? "active" : ""}`}
                type="button"
                title={image.filename}
                onClick={() => props.onSelectImage(index())}
              >
                <span class={`status-dot ${image.annotated ? "done" : ""}`} />
                <span class="filename">{image.filename}</span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </aside>
  );
}
