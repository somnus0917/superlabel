import Konva from "konva";
import { createEffect, onCleanup, onMount } from "solid-js";
import {
  addBox,
  deleteBox,
  selectBox,
  setDrawMode,
  state,
  updateBox,
} from "../stores/app";
import { pixelToYolo, yoloToPixel } from "../utils/yolo";

interface Props {
  imageSrc: string;
  containerWidth: number;
  containerHeight: number;
}

interface ImageMetrics {
  naturalW: number;
  naturalH: number;
  imgW: number;
  imgH: number;
  offsetX: number;
  offsetY: number;
}

type HorizontalResizeEdge = "left" | "center" | "right";
type VerticalResizeEdge = "top" | "middle" | "bottom";

interface ResizeHandleConfig {
  id: string;
  horizontal: HorizontalResizeEdge;
  vertical: VerticalResizeEdge;
  cursor: string;
}

interface Viewport {
  scale: number;
  x: number;
  y: number;
}

const HANDLE_SIZE = 8;
const MIN_BOX_SIZE = 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.12;
const RESIZE_HANDLES: ResizeHandleConfig[] = [
  { id: "top-left", horizontal: "left", vertical: "top", cursor: "nwse-resize" },
  { id: "top", horizontal: "center", vertical: "top", cursor: "ns-resize" },
  { id: "top-right", horizontal: "right", vertical: "top", cursor: "nesw-resize" },
  { id: "right", horizontal: "right", vertical: "middle", cursor: "ew-resize" },
  { id: "bottom-right", horizontal: "right", vertical: "bottom", cursor: "nwse-resize" },
  { id: "bottom", horizontal: "center", vertical: "bottom", cursor: "ns-resize" },
  { id: "bottom-left", horizontal: "left", vertical: "bottom", cursor: "nesw-resize" },
  { id: "left", horizontal: "left", vertical: "middle", cursor: "ew-resize" },
];

export default function AnnotationCanvas(props: Props) {
  let containerRef: HTMLDivElement | undefined;
  let stage: Konva.Stage | undefined;
  let imageLayer: Konva.Layer | undefined;
  let annotationLayer: Konva.Layer | undefined;
  let drawingLayer: Konva.Layer | undefined;
  let imageNode: Konva.Image | undefined;
  let imageEl: HTMLImageElement | undefined;
  let metrics: ImageMetrics | undefined;
  let viewport: Viewport = { scale: 1, x: 0, y: 0 };
  let drawingStart: { x: number; y: number } | null = null;
  let tempRect: Konva.Rect | null = null;

  function transformedLayers() {
    return [imageLayer, annotationLayer, drawingLayer].filter((layer): layer is Konva.Layer =>
      Boolean(layer),
    );
  }

  function applyViewport() {
    transformedLayers().forEach((layer) => {
      layer.scale({ x: viewport.scale, y: viewport.scale });
      layer.position({ x: viewport.x, y: viewport.y });
      layer.batchDraw();
    });
  }

  function resetViewport() {
    viewport = { scale: 1, x: 0, y: 0 };
    applyViewport();
  }

  function clampZoom(scale: number) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  }

  function screenToContent(x: number, y: number) {
    return {
      x: (x - viewport.x) / viewport.scale,
      y: (y - viewport.y) / viewport.scale,
    };
  }

  function calculateMetrics(): ImageMetrics | undefined {
    if (!imageEl || props.containerWidth <= 0 || props.containerHeight <= 0) return undefined;
    const naturalW = imageEl.naturalWidth;
    const naturalH = imageEl.naturalHeight;
    const scale = Math.min(props.containerWidth / naturalW, props.containerHeight / naturalH);
    const imgW = naturalW * scale;
    const imgH = naturalH * scale;
    return {
      naturalW,
      naturalH,
      imgW,
      imgH,
      offsetX: (props.containerWidth - imgW) / 2,
      offsetY: (props.containerHeight - imgH) / 2,
    };
  }

  function redrawImage() {
    if (!imageLayer || !imageEl) return;
    metrics = calculateMetrics();
    if (!metrics) return;
    imageLayer.destroyChildren();
    imageNode = new Konva.Image({
      image: imageEl,
      x: metrics.offsetX,
      y: metrics.offsetY,
      width: metrics.imgW,
      height: metrics.imgH,
      listening: true,
    });
    imageLayer.add(imageNode);
    imageLayer.batchDraw();
    renderBoxes();
  }

  function clampToImage(x: number, y: number) {
    if (!metrics) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(metrics.imgW, x - metrics.offsetX)),
      y: Math.max(0, Math.min(metrics.imgH, y - metrics.offsetY)),
    };
  }

  function pointerInImage() {
    if (!stage || !metrics) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const contentPointer = screenToContent(pointer.x, pointer.y);
    return clampToImage(contentPointer.x, contentPointer.y);
  }

  function classForId(classId: number) {
    return state.project?.classes.find((item) => item.id === classId);
  }

  function renderBoxes() {
    if (!annotationLayer || !metrics) return;
    annotationLayer.destroyChildren();

    state.currentBoxes.forEach((box) => {
      const pixel = yoloToPixel(box.cx, box.cy, box.w, box.h, metrics!.imgW, metrics!.imgH);
      const selected = state.selectedBoxId === box.id;
      const annotationClass = classForId(box.classId);
      const color = annotationClass?.color ?? "#4a9eff";
      const group = new Konva.Group({
        x: metrics!.offsetX + pixel.x,
        y: metrics!.offsetY + pixel.y,
        draggable: state.drawMode === "select",
      });

      const rect = new Konva.Rect({
        x: 0,
        y: 0,
        width: pixel.width,
        height: pixel.height,
        stroke: color,
        strokeWidth: selected ? 3 : 2,
        dash: selected ? [] : [6, 4],
        fill: selected ? `${color}22` : "transparent",
      });

      const label = new Konva.Text({
        x: 0,
        y: Math.max(-20, -metrics!.offsetY - pixel.y),
        text: annotationClass ? `${annotationClass.name} #${annotationClass.id}` : `Class #${box.classId}`,
        fill: "#ffffff",
        fontSize: 12,
        fontStyle: "bold",
        padding: 4,
        shadowColor: "#000000",
        shadowBlur: 2,
        listening: false,
      });

      group.add(rect);
      group.add(label);

      if (selected) {
        const handles: Array<{ node: Konva.Rect; config: ResizeHandleConfig }> = [];
        const handleOffset = HANDLE_SIZE / 2;

        function imageBounds() {
          const left = Math.max(0, Math.min(metrics!.imgW - MIN_BOX_SIZE, group.x() - metrics!.offsetX));
          const top = Math.max(0, Math.min(metrics!.imgH - MIN_BOX_SIZE, group.y() - metrics!.offsetY));
          return {
            left,
            top,
            right: Math.min(metrics!.imgW, left + rect.width()),
            bottom: Math.min(metrics!.imgH, top + rect.height()),
          };
        }

        function handleX(config: ResizeHandleConfig, width: number) {
          if (config.horizontal === "left") return -handleOffset;
          if (config.horizontal === "right") return width - handleOffset;
          return width / 2 - handleOffset;
        }

        function handleY(config: ResizeHandleConfig, height: number) {
          if (config.vertical === "top") return -handleOffset;
          if (config.vertical === "bottom") return height - handleOffset;
          return height / 2 - handleOffset;
        }

        function positionHandles() {
          const width = rect.width();
          const height = rect.height();
          handles.forEach(({ node, config }) => {
            node.position({
              x: handleX(config, width),
              y: handleY(config, height),
            });
          });
        }

        function saveResizedBox() {
          const left = group.x() - metrics!.offsetX;
          const top = group.y() - metrics!.offsetY;
          updateBox(
            box.id,
            pixelToYolo(left, top, rect.width(), rect.height(), metrics!.imgW, metrics!.imgH),
          );
        }

        function resizeFromPointer(config: ResizeHandleConfig) {
          const pointer = pointerInImage();
          if (!pointer) return;

          let { left, top, right, bottom } = imageBounds();

          if (config.horizontal === "left") {
            left = Math.max(0, Math.min(pointer.x, right - MIN_BOX_SIZE));
          }
          if (config.horizontal === "right") {
            right = Math.min(metrics!.imgW, Math.max(pointer.x, left + MIN_BOX_SIZE));
          }
          if (config.vertical === "top") {
            top = Math.max(0, Math.min(pointer.y, bottom - MIN_BOX_SIZE));
          }
          if (config.vertical === "bottom") {
            bottom = Math.min(metrics!.imgH, Math.max(pointer.y, top + MIN_BOX_SIZE));
          }

          group.position({
            x: metrics!.offsetX + left,
            y: metrics!.offsetY + top,
          });
          rect.size({
            width: right - left,
            height: bottom - top,
          });
          label.y(Math.max(-20, -metrics!.offsetY - top));
          positionHandles();
          annotationLayer?.batchDraw();
        }

        RESIZE_HANDLES.forEach((config) => {
          const handle = new Konva.Rect({
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            fill: "#ffffff",
            stroke: color,
            strokeWidth: 2,
            draggable: true,
            name: config.id,
          });

          handle.on("mouseenter", () => {
            if (stage) stage.container().style.cursor = config.cursor;
          });
          handle.on("mouseleave", () => {
            if (stage) stage.container().style.cursor = "default";
          });
          handle.on("dragmove", (event) => {
            event.cancelBubble = true;
            resizeFromPointer(config);
          });
          handle.on("dragend", (event) => {
            event.cancelBubble = true;
            if (stage) stage.container().style.cursor = "default";
            saveResizedBox();
          });

          handles.push({ node: handle, config });
          group.add(handle);
        });

        positionHandles();
      }

      group.on("click tap", (event) => {
        event.cancelBubble = true;
        selectBox(box.id);
      });

      group.on("dragend", () => {
        const width = rect.width();
        const height = rect.height();
        const x = Math.max(0, Math.min(metrics!.imgW - width, group.x() - metrics!.offsetX));
        const y = Math.max(0, Math.min(metrics!.imgH - height, group.y() - metrics!.offsetY));
        updateBox(box.id, pixelToYolo(x, y, width, height, metrics!.imgW, metrics!.imgH));
      });

      annotationLayer!.add(group);
    });

    annotationLayer.batchDraw();
  }

  function startDrawing() {
    if (state.drawMode !== "draw" || !drawingLayer || !metrics) return;
    drawingStart = pointerInImage();
    if (!drawingStart) return;
    selectBox(null);
    tempRect = new Konva.Rect({
      x: metrics.offsetX + drawingStart.x,
      y: metrics.offsetY + drawingStart.y,
      width: 0,
      height: 0,
      stroke: classForId(state.activeClassId)?.color ?? "#4a9eff",
      strokeWidth: 2,
      dash: [6, 4],
      fill: "#4a9eff22",
    });
    drawingLayer.add(tempRect);
  }

  function moveDrawing() {
    if (!drawingStart || !tempRect || !drawingLayer || !metrics) return;
    const current = pointerInImage();
    if (!current) return;
    const x = Math.min(drawingStart.x, current.x);
    const y = Math.min(drawingStart.y, current.y);
    const width = Math.abs(current.x - drawingStart.x);
    const height = Math.abs(current.y - drawingStart.y);
    tempRect.setAttrs({
      x: metrics.offsetX + x,
      y: metrics.offsetY + y,
      width,
      height,
    });
    drawingLayer.batchDraw();
  }

  function finishDrawing() {
    if (!drawingStart || !tempRect || !drawingLayer || !metrics) return;
    const width = tempRect.width();
    const height = tempRect.height();
    const x = tempRect.x() - metrics.offsetX;
    const y = tempRect.y() - metrics.offsetY;
    tempRect.destroy();
    tempRect = null;
    drawingStart = null;
    drawingLayer.batchDraw();

    if (width > 8 && height > 8) {
      addBox({
        id: `box-${Date.now()}`,
        classId: state.activeClassId,
        ...pixelToYolo(x, y, width, height, metrics.imgW, metrics.imgH),
      });
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (key === "d") setDrawMode("draw");
    if (event.key === "Escape") setDrawMode("select");
    if ((event.key === "Delete" || event.key === "Backspace") && state.selectedBoxId) {
      event.preventDefault();
      deleteBox(state.selectedBoxId);
    }
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    if (!stage || !metrics) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const shouldPan =
      event.evt.shiftKey ||
      event.evt.altKey ||
      Math.abs(event.evt.deltaX) > Math.abs(event.evt.deltaY);

    if (shouldPan) {
      let panX = event.evt.deltaX;
      let panY = event.evt.deltaY;
      if (event.evt.shiftKey && !event.evt.deltaX) {
        panX = event.evt.deltaY;
        panY = 0;
      }
      if (event.evt.altKey && !event.evt.deltaX) {
        panX = 0;
        panY = event.evt.deltaY;
      }
      viewport = {
        ...viewport,
        x: viewport.x - panX,
        y: viewport.y - panY,
      };
      applyViewport();
      return;
    }

    const nextScale = clampZoom(
      event.evt.deltaY < 0 ? viewport.scale * ZOOM_STEP : viewport.scale / ZOOM_STEP,
    );
    if (nextScale === viewport.scale) return;

    const contentPointer = screenToContent(pointer.x, pointer.y);
    viewport = {
      scale: nextScale,
      x: pointer.x - contentPointer.x * nextScale,
      y: pointer.y - contentPointer.y * nextScale,
    };
    applyViewport();
  }

  onMount(() => {
    stage = new Konva.Stage({
      container: containerRef!,
      width: props.containerWidth,
      height: props.containerHeight,
    });
    imageLayer = new Konva.Layer();
    annotationLayer = new Konva.Layer();
    drawingLayer = new Konva.Layer();
    stage.add(imageLayer);
    stage.add(annotationLayer);
    stage.add(drawingLayer);
    stage.on("mousedown touchstart", startDrawing);
    stage.on("mousemove touchmove", moveDrawing);
    stage.on("mouseup touchend", finishDrawing);
    stage.on("wheel", handleWheel);
    stage.on("click tap", (event) => {
      if (event.target === stage || event.target === imageNode) selectBox(null);
    });
    window.addEventListener("keydown", handleKeydown);
  });

  createEffect(() => {
    const width = props.containerWidth;
    const height = props.containerHeight;
    if (!stage) return;
    stage.width(width);
    stage.height(height);
    applyViewport();
    redrawImage();
  });

  createEffect(() => {
    const src = props.imageSrc;
    if (!imageLayer || !src) return;
    imageLayer.destroyChildren();
    annotationLayer?.destroyChildren();
    const img = new Image();
    img.onload = () => {
      imageEl = img;
      resetViewport();
      redrawImage();
    };
    img.src = src;
  });

  createEffect(() => {
    state.currentBoxes.map((box) => `${box.id}:${box.cx}:${box.cy}:${box.w}:${box.h}:${box.classId}`).join("|");
    state.selectedBoxId;
    state.drawMode;
    state.project?.classes.map((item) => `${item.id}:${item.name}:${item.color}`).join("|");
    renderBoxes();
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeydown);
    stage?.destroy();
  });

  return <div ref={containerRef} class="annotation-canvas" />;
}
