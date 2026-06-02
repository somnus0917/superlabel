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

export default function AnnotationCanvas(props: Props) {
  let containerRef: HTMLDivElement | undefined;
  let stage: Konva.Stage | undefined;
  let imageLayer: Konva.Layer | undefined;
  let annotationLayer: Konva.Layer | undefined;
  let drawingLayer: Konva.Layer | undefined;
  let imageNode: Konva.Image | undefined;
  let imageEl: HTMLImageElement | undefined;
  let metrics: ImageMetrics | undefined;
  let drawingStart: { x: number; y: number } | null = null;
  let tempRect: Konva.Rect | null = null;

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
    return clampToImage(pointer.x, pointer.y);
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
        const handle = new Konva.Rect({
          x: Math.max(0, pixel.width - 4),
          y: Math.max(0, pixel.height - 4),
          width: 8,
          height: 8,
          fill: "#ffffff",
          stroke: color,
          strokeWidth: 2,
          draggable: true,
        });

        handle.on("dragmove", (event) => {
          event.cancelBubble = true;
          const nextWidth = Math.max(8, Math.min(metrics!.imgW - pixel.x, handle.x() + 4));
          const nextHeight = Math.max(8, Math.min(metrics!.imgH - pixel.y, handle.y() + 4));
          rect.width(nextWidth);
          rect.height(nextHeight);
          handle.x(nextWidth - 4);
          handle.y(nextHeight - 4);
          annotationLayer?.batchDraw();
        });

        handle.on("dragend", (event) => {
          event.cancelBubble = true;
          updateBox(
            box.id,
            pixelToYolo(pixel.x, pixel.y, rect.width(), rect.height(), metrics!.imgW, metrics!.imgH),
          );
        });

        group.add(handle);
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
