export interface ModelPreset {
  id: string;
  name: string;
  group: "Detection" | "Segmentation" | "Open Vocabulary" | "World";
  url: string;
  filename: string;
  classMin: number;
  classMax: number;
  inputSize: number;
  note?: string;
}

const BASE_V010 =
  "https://github.com/CVHub520/X-AnyLabeling/releases/download/v0.1.0";
const BASE_V237 =
  "https://github.com/CVHub520/X-AnyLabeling/releases/download/v2.3.7";

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "yolov8n",
    name: "YOLOv8n COCO",
    group: "Detection",
    url: `${BASE_V010}/yolov8n.onnx`,
    filename: "yolov8n.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
  },
  {
    id: "yolov8s",
    name: "YOLOv8s COCO",
    group: "Detection",
    url: `${BASE_V010}/yolov8s.onnx`,
    filename: "yolov8s.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
  },
  {
    id: "yolov8m",
    name: "YOLOv8m COCO",
    group: "Detection",
    url: `${BASE_V010}/yolov8m.onnx`,
    filename: "yolov8m.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
  },
  {
    id: "yolov8l",
    name: "YOLOv8l COCO",
    group: "Detection",
    url: `${BASE_V010}/yolov8l.onnx`,
    filename: "yolov8l.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
  },
  {
    id: "yolov8x",
    name: "YOLOv8x COCO",
    group: "Detection",
    url: `${BASE_V010}/yolov8x.onnx`,
    filename: "yolov8x.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
  },
  {
    id: "yolov8n-seg",
    name: "YOLOv8n Seg",
    group: "Segmentation",
    url: `${BASE_V010}/yolov8n-seg.onnx`,
    filename: "yolov8n-seg.onnx",
    classMin: 0,
    classMax: 79,
    inputSize: 640,
    note: "Mask decoding is not implemented yet.",
  },
  {
    id: "yolov8x-oiv7",
    name: "YOLOv8x OIV7",
    group: "Open Vocabulary",
    url: `${BASE_V237}/yolov8x-oiv7.onnx`,
    filename: "yolov8x-oiv7.onnx",
    classMin: 0,
    classMax: 600,
    inputSize: 640,
  },
  {
    id: "yolov8s-worldv2",
    name: "YOLOv8s World v2",
    group: "World",
    url: `${BASE_V237}/yolov8s-worldv2.onnx`,
    filename: "yolov8s-worldv2.onnx",
    classMin: 0,
    classMax: 600,
    inputSize: 640,
    note: "Custom text prompts are not implemented yet.",
  },
];
