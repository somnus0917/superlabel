import Konva from "konva";
import { createEffect, onCleanup, onMount } from "solid-js";
import {
  addBox,
  addShape,
  deleteBox,
  deleteShape,
  redoBoxes,
  selectBox,
  selectShape,
  setActiveClass,
  setDrawMode,
  state,
  undoBoxes,
  updateBox,
  updateShape,
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

interface SnapResult {
  point: { x: number; y: number };
  snapped: boolean;
  currentFirstVertex: boolean;
}

const HANDLE_SIZE = 8;
const MIN_BOX_SIZE = 8;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.12;
const SNAP_THRESHOLD = 10;
const RESIZE_HANDLES: ResizeHandleConfig[] = [
  {
    id: "top-left",
    horizontal: "left",
    vertical: "top",
    cursor: "nwse-resize",
  },
  { id: "top", horizontal: "center", vertical: "top", cursor: "ns-resize" },
  {
    id: "top-right",
    horizontal: "right",
    vertical: "top",
    cursor: "nesw-resize",
  },
  { id: "right", horizontal: "right", vertical: "middle", cursor: "ew-resize" },
  {
    id: "bottom-right",
    horizontal: "right",
    vertical: "bottom",
    cursor: "nwse-resize",
  },
  {
    id: "bottom",
    horizontal: "center",
    vertical: "bottom",
    cursor: "ns-resize",
  },
  {
    id: "bottom-left",
    horizontal: "left",
    vertical: "bottom",
    cursor: "nesw-resize",
  },
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
  let tempLine: Konva.Line | null = null;
  let tempCircle: Konva.Circle | null = null;
  let polygonPoints: Array<{ x: number; y: number }> = [];
  let tempPolygon: Konva.Line | null = null;
  let tempSnapPoint: Konva.Circle | null = null;

  function transformedLayers() {
    return [imageLayer, annotationLayer, drawingLayer].filter(
      (layer): layer is Konva.Layer => Boolean(layer),
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
    if (!imageEl || props.containerWidth <= 0 || props.containerHeight <= 0)
      return undefined;
    const naturalW = imageEl.naturalWidth;
    const naturalH = imageEl.naturalHeight;
    const scale = Math.min(
      props.containerWidth / naturalW,
      props.containerHeight / naturalH,
    );
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

  function normalizedToCanvas(point: { x: number; y: number }) {
    return {
      x: metrics!.offsetX + point.x * metrics!.imgW,
      y: metrics!.offsetY + point.y * metrics!.imgH,
    };
  }

  function imagePointToNormalized(point: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.min(1, point.x / metrics!.imgW)),
      y: Math.max(0, Math.min(1, point.y / metrics!.imgH)),
    };
  }

  function normalizedToImage(point: { x: number; y: number }) {
    return {
      x: point.x * metrics!.imgW,
      y: point.y * metrics!.imgH,
    };
  }

  function snapThreshold() {
    return SNAP_THRESHOLD / viewport.scale;
  }

  function distance(
    left: { x: number; y: number },
    right: { x: number; y: number },
  ) {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  function projectPointToSegment(
    point: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
  ) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return start;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
      ),
    );
    return {
      x: start.x + t * dx,
      y: start.y + t * dy,
    };
  }

  function addSnapSegments(
    segments: Array<[{ x: number; y: number }, { x: number; y: number }]>,
    points: Array<{ x: number; y: number }>,
    closed = false,
  ) {
    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push([points[index], points[index + 1]]);
    }
    if (closed && points.length > 2) {
      segments.push([points[points.length - 1], points[0]]);
    }
  }

  function rectangleSnapPoints(box: (typeof state.currentBoxes)[number]) {
    const pixel = yoloToPixel(
      box.cx,
      box.cy,
      box.w,
      box.h,
      metrics!.imgW,
      metrics!.imgH,
    );
    const topLeft = { x: pixel.x, y: pixel.y };
    const topRight = { x: pixel.x + pixel.width, y: pixel.y };
    const bottomRight = {
      x: pixel.x + pixel.width,
      y: pixel.y + pixel.height,
    };
    const bottomLeft = { x: pixel.x, y: pixel.y + pixel.height };
    return [topLeft, topRight, bottomRight, bottomLeft];
  }

  function snapPolygonPoint(pointer: { x: number; y: number }): SnapResult {
    if (!metrics) {
      return { point: pointer, snapped: false, currentFirstVertex: false };
    }

    const threshold = snapThreshold();
    let bestPoint = pointer;
    let bestDistance = threshold;
    let currentFirstVertex = false;
    const vertices: Array<{
      point: { x: number; y: number };
      currentFirstVertex?: boolean;
    }> = [];
    const segments: Array<
      [{ x: number; y: number }, { x: number; y: number }]
    > = [];

    [...state.currentBoxes, ...state.suggestedBoxes].forEach((box) => {
      const points = rectangleSnapPoints(box);
      points.forEach((point) => vertices.push({ point }));
      addSnapSegments(segments, points, true);
    });

    state.currentShapes.forEach((shape) => {
      const points = shape.points.map(normalizedToImage);
      if (shape.kind === "polygon") {
        points.forEach((point) => vertices.push({ point }));
        addSnapSegments(segments, points, true);
      }
      if (shape.kind === "line") {
        points.forEach((point) => vertices.push({ point }));
        addSnapSegments(segments, points, false);
      }
      if (shape.kind === "point" || shape.kind === "circle") {
        points.forEach((point) => vertices.push({ point }));
      }
    });

    polygonPoints.forEach((point, index) => {
      vertices.push({ point, currentFirstVertex: index === 0 });
    });
    addSnapSegments(segments, polygonPoints, false);

    vertices.forEach((candidate) => {
      const candidateDistance = distance(pointer, candidate.point);
      if (candidateDistance <= bestDistance) {
        bestPoint = candidate.point;
        bestDistance = candidateDistance;
        currentFirstVertex = Boolean(candidate.currentFirstVertex);
      }
    });

    segments.forEach(([start, end]) => {
      const projected = projectPointToSegment(pointer, start, end);
      const candidateDistance = distance(pointer, projected);
      if (candidateDistance < bestDistance) {
        bestPoint = projected;
        bestDistance = candidateDistance;
        currentFirstVertex = false;
      }
    });

    return {
      point: bestPoint,
      snapped: bestDistance < threshold,
      currentFirstVertex,
    };
  }

  function updateSnapIndicator(snap: SnapResult) {
    if (!drawingLayer || !metrics || !snap.snapped) {
      tempSnapPoint?.destroy();
      tempSnapPoint = null;
      drawingLayer?.batchDraw();
      return;
    }

    const x = metrics.offsetX + snap.point.x;
    const y = metrics.offsetY + snap.point.y;
    if (!tempSnapPoint) {
      tempSnapPoint = new Konva.Circle({
        x,
        y,
        radius: 5,
        stroke: "#ffffff",
        strokeWidth: 2,
        fill: "#4a9eff",
        listening: false,
      });
      drawingLayer.add(tempSnapPoint);
    } else {
      tempSnapPoint.position({ x, y });
    }
    tempSnapPoint.moveToTop();
  }

  function renderShape(shape: (typeof state.currentShapes)[number]) {
    if (!annotationLayer || !metrics || shape.points.length === 0) return;
    const annotationClass = classForId(shape.classId);
    const color = annotationClass?.color ?? "#4a9eff";
    const selected = state.selectedShapeId === shape.id;
    const group = new Konva.Group({ listening: true });
    const labelPoint = normalizedToCanvas(shape.points[0]);

    if (shape.kind === "point") {
      group.add(
        new Konva.Circle({
          x: labelPoint.x,
          y: labelPoint.y,
          radius: selected ? 6 : 5,
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          fill: `${color}44`,
        }),
      );
    }

    if (shape.kind === "line" && shape.points.length >= 2) {
      const points = shape.points.flatMap((point) => {
        const canvasPoint = normalizedToCanvas(point);
        return [canvasPoint.x, canvasPoint.y];
      });
      group.add(
        new Konva.Line({
          points,
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          lineCap: "round",
          lineJoin: "round",
        }),
      );
    }

    if (shape.kind === "circle" && shape.points.length >= 2) {
      const center = normalizedToCanvas(shape.points[0]);
      const edge = normalizedToCanvas(shape.points[1]);
      group.add(
        new Konva.Circle({
          x: center.x,
          y: center.y,
          radius: Math.hypot(edge.x - center.x, edge.y - center.y),
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          fill: selected ? `${color}22` : "transparent",
        }),
      );
    }

    if (shape.kind === "polygon" && shape.points.length >= 2) {
      const points = shape.points.flatMap((point) => {
        const canvasPoint = normalizedToCanvas(point);
        return [canvasPoint.x, canvasPoint.y];
      });
      group.add(
        new Konva.Line({
          points,
          closed: shape.points.length >= 3,
          stroke: color,
          strokeWidth: selected ? 3 : 2,
          fill: shape.points.length >= 3 ? `${color}20` : "transparent",
          lineJoin: "round",
        }),
      );
    }

    group.add(
      new Konva.Text({
        x: labelPoint.x,
        y: Math.max(0, labelPoint.y - 20),
        text: annotationClass
          ? `${annotationClass.name} #${annotationClass.id}`
          : `Class #${shape.classId}`,
        fill: "#ffffff",
        fontSize: 12,
        fontStyle: "bold",
        padding: 4,
        shadowColor: "#000000",
        shadowBlur: 2,
        listening: false,
      }),
    );
    group.on("click tap", (event) => {
      event.cancelBubble = true;
      selectShape(shape.id);
    });
    annotationLayer.add(group);
  }

  function renderBoxes() {
    if (!annotationLayer || !metrics) return;
    annotationLayer.destroyChildren();

    state.suggestedBoxes.forEach((box) => {
      const pixel = yoloToPixel(
        box.cx,
        box.cy,
        box.w,
        box.h,
        metrics!.imgW,
        metrics!.imgH,
      );
      const annotationClass = classForId(box.classId);
      const color = annotationClass?.color ?? "#4a9eff";
      const group = new Konva.Group({
        x: metrics!.offsetX + pixel.x,
        y: metrics!.offsetY + pixel.y,
        listening: false,
      });

      group.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: pixel.width,
          height: pixel.height,
          stroke: color,
          strokeWidth: 2,
          dash: [4, 5],
          opacity: 0.78,
          fill: `${color}18`,
        }),
      );

      group.add(
        new Konva.Text({
          x: 0,
          y: Math.max(-20, -metrics!.offsetY - pixel.y),
          text: annotationClass
            ? `${annotationClass.name} #${annotationClass.id}`
            : `Class #${box.classId}`,
          fill: "#dceaff",
          fontSize: 12,
          fontStyle: "bold",
          padding: 4,
          shadowColor: "#000000",
          shadowBlur: 2,
          listening: false,
        }),
      );

      annotationLayer!.add(group);
    });

    state.currentShapes.forEach(renderShape);

    state.currentBoxes.forEach((box) => {
      const pixel = yoloToPixel(
        box.cx,
        box.cy,
        box.w,
        box.h,
        metrics!.imgW,
        metrics!.imgH,
      );
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
        text: annotationClass
          ? `${annotationClass.name} #${annotationClass.id}`
          : `Class #${box.classId}`,
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
        const handles: Array<{ node: Konva.Rect; config: ResizeHandleConfig }> =
          [];
        const handleOffset = HANDLE_SIZE / 2;

        function imageBounds() {
          const left = Math.max(
            0,
            Math.min(
              metrics!.imgW - MIN_BOX_SIZE,
              group.x() - metrics!.offsetX,
            ),
          );
          const top = Math.max(
            0,
            Math.min(
              metrics!.imgH - MIN_BOX_SIZE,
              group.y() - metrics!.offsetY,
            ),
          );
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
            pixelToYolo(
              left,
              top,
              rect.width(),
              rect.height(),
              metrics!.imgW,
              metrics!.imgH,
            ),
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
            right = Math.min(
              metrics!.imgW,
              Math.max(pointer.x, left + MIN_BOX_SIZE),
            );
          }
          if (config.vertical === "top") {
            top = Math.max(0, Math.min(pointer.y, bottom - MIN_BOX_SIZE));
          }
          if (config.vertical === "bottom") {
            bottom = Math.min(
              metrics!.imgH,
              Math.max(pointer.y, top + MIN_BOX_SIZE),
            );
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
        const x = Math.max(
          0,
          Math.min(metrics!.imgW - width, group.x() - metrics!.offsetX),
        );
        const y = Math.max(
          0,
          Math.min(metrics!.imgH - height, group.y() - metrics!.offsetY),
        );
        updateBox(
          box.id,
          pixelToYolo(x, y, width, height, metrics!.imgW, metrics!.imgH),
        );
      });

      annotationLayer!.add(group);
    });

    annotationLayer.batchDraw();
  }

  function redrawTempPolygon(pointer?: { x: number; y: number }) {
    if (!drawingLayer || !metrics) return;
    const color = classForId(state.activeClassId)?.color ?? "#4a9eff";
    const snap = pointer ? snapPolygonPoint(pointer) : null;
    const previewPoint = snap?.point ?? pointer;
    const points = [
      ...polygonPoints,
      ...(previewPoint ? [previewPoint] : []),
    ].flatMap((point) => [
      metrics!.offsetX + point.x,
      metrics!.offsetY + point.y,
    ]);

    if (!tempPolygon) {
      tempPolygon = new Konva.Line({
        points,
        stroke: color,
        strokeWidth: 2,
        dash: [6, 4],
        fill: "#4a9eff22",
        lineJoin: "round",
      });
      drawingLayer.add(tempPolygon);
    } else {
      tempPolygon.points(points);
      tempPolygon.closed(polygonPoints.length >= 3 && !pointer);
    }
    if (snap) updateSnapIndicator(snap);
    drawingLayer.batchDraw();
  }

  function finishPolygon() {
    if (!drawingLayer || !metrics || polygonPoints.length < 3) return;
    addShape({
      id: `shape-${Date.now()}`,
      kind: "polygon",
      classId: state.activeClassId,
      points: polygonPoints.map(imagePointToNormalized),
    });
    cancelPolygon();
  }

  function cancelPolygon() {
    polygonPoints = [];
    tempPolygon?.destroy();
    tempPolygon = null;
    tempSnapPoint?.destroy();
    tempSnapPoint = null;
    drawingLayer?.batchDraw();
  }

  function startDrawing() {
    if (state.drawMode !== "draw" || !drawingLayer || !metrics) return;
    selectBox(null);
    selectShape(null);
    const pointer = pointerInImage();
    if (!pointer) return;

    if (state.shapeTool === "point") {
      addShape({
        id: `shape-${Date.now()}`,
        kind: "point",
        classId: state.activeClassId,
        points: [imagePointToNormalized(pointer)],
      });
      return;
    }

    if (state.shapeTool === "polygon") {
      const snap = snapPolygonPoint(pointer);
      if (snap.currentFirstVertex && polygonPoints.length >= 3) {
        finishPolygon();
        return;
      }
      polygonPoints.push(snap.point);
      redrawTempPolygon(snap.point);
      updateSnapIndicator(snap);
      return;
    }

    drawingStart = pointer;
    if (state.shapeTool === "line") {
      tempLine = new Konva.Line({
        points: [
          metrics.offsetX + pointer.x,
          metrics.offsetY + pointer.y,
          metrics.offsetX + pointer.x,
          metrics.offsetY + pointer.y,
        ],
        stroke: classForId(state.activeClassId)?.color ?? "#4a9eff",
        strokeWidth: 2,
        dash: [6, 4],
        lineCap: "round",
      });
      drawingLayer.add(tempLine);
      return;
    }

    if (state.shapeTool === "circle") {
      tempCircle = new Konva.Circle({
        x: metrics.offsetX + pointer.x,
        y: metrics.offsetY + pointer.y,
        radius: 0,
        stroke: classForId(state.activeClassId)?.color ?? "#4a9eff",
        strokeWidth: 2,
        dash: [6, 4],
        fill: "#4a9eff22",
      });
      drawingLayer.add(tempCircle);
      return;
    }

    tempRect = new Konva.Rect({
      x: metrics.offsetX + pointer.x,
      y: metrics.offsetY + pointer.y,
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
    if (!drawingLayer || !metrics) return;
    const current = pointerInImage();
    if (!current) return;

    if (state.shapeTool === "polygon" && polygonPoints.length > 0) {
      const snap = snapPolygonPoint(current);
      redrawTempPolygon(snap.point);
      updateSnapIndicator(snap);
      return;
    }

    if (!drawingStart) return;

    if (state.shapeTool === "line" && tempLine) {
      tempLine.points([
        metrics.offsetX + drawingStart.x,
        metrics.offsetY + drawingStart.y,
        metrics.offsetX + current.x,
        metrics.offsetY + current.y,
      ]);
      drawingLayer.batchDraw();
      return;
    }

    if (state.shapeTool === "circle" && tempCircle) {
      tempCircle.radius(
        Math.hypot(current.x - drawingStart.x, current.y - drawingStart.y),
      );
      drawingLayer.batchDraw();
      return;
    }

    if (!tempRect) return;
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
    if (!drawingLayer || !metrics) return;
    const current = pointerInImage();
    if (drawingStart && current && state.shapeTool === "line" && tempLine) {
      tempLine.destroy();
      tempLine = null;
      drawingLayer.batchDraw();
      if (
        Math.hypot(current.x - drawingStart.x, current.y - drawingStart.y) >
        MIN_BOX_SIZE
      ) {
        addShape({
          id: `shape-${Date.now()}`,
          kind: "line",
          classId: state.activeClassId,
          points: [
            imagePointToNormalized(drawingStart),
            imagePointToNormalized(current),
          ],
        });
      }
      drawingStart = null;
      return;
    }

    if (drawingStart && current && state.shapeTool === "circle" && tempCircle) {
      const radius = tempCircle.radius();
      tempCircle.destroy();
      tempCircle = null;
      drawingLayer.batchDraw();
      if (radius > MIN_BOX_SIZE) {
        addShape({
          id: `shape-${Date.now()}`,
          kind: "circle",
          classId: state.activeClassId,
          points: [
            imagePointToNormalized(drawingStart),
            imagePointToNormalized(current),
          ],
        });
      }
      drawingStart = null;
      return;
    }

    if (!drawingStart || !tempRect) return;
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
    if (isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    const commandKey = event.ctrlKey || event.metaKey;

    if (commandKey && key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoBoxes();
      } else {
        undoBoxes();
      }
      return;
    }
    if (event.ctrlKey && key === "y") {
      event.preventDefault();
      redoBoxes();
      return;
    }

    if (!commandKey && !event.altKey && switchClassWithNumberKey(event.key)) {
      event.preventDefault();
      return;
    }

    if (key === "enter" && state.shapeTool === "polygon") {
      event.preventDefault();
      finishPolygon();
      return;
    }

    if (key === "d") setDrawMode("draw");
    if (event.key === "Escape") {
      cancelPolygon();
      setDrawMode("select");
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      state.selectedBoxId
    ) {
      event.preventDefault();
      deleteBox(state.selectedBoxId);
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      state.selectedShapeId
    ) {
      event.preventDefault();
      deleteShape(state.selectedShapeId);
    }
  }

  function switchClassWithNumberKey(key: string) {
    if (!/^[0-9]$/.test(key)) return false;

    const classes = state.project?.classes ?? [];
    const classIndex = key === "0" ? 9 : Number(key) - 1;
    const annotationClass = classes[classIndex];
    if (!annotationClass) return false;

    setActiveClass(annotationClass.id);
    if (state.selectedBoxId) {
      updateBox(state.selectedBoxId, { classId: annotationClass.id });
    }
    if (state.selectedShapeId) {
      updateShape(state.selectedShapeId, { classId: annotationClass.id });
    }

    return true;
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
      event.evt.deltaY < 0
        ? viewport.scale * ZOOM_STEP
        : viewport.scale / ZOOM_STEP,
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
      if (event.target === stage || event.target === imageNode) {
        selectBox(null);
        selectShape(null);
      }
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
    void state.suggestedBoxes;
    void state.currentBoxes;
    void state.currentShapes;
    state.selectedBoxId;
    state.selectedShapeId;
    state.drawMode;
    state.shapeTool;
    void state.project?.classes;
    renderBoxes();
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeydown);
    stage?.destroy();
  });

  return <div ref={containerRef} class="annotation-canvas" />;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}
