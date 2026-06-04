# superlabel

superlabel is a lightweight desktop annotation tool for object detection datasets. It is built with Tauri, SolidJS, Konva, and Rust, with a focus on fast manual labeling, local-first workflows, and ONNX-assisted pre-labeling.

## Features

- Local image and label folder workflow.
- Workspace memory: reopen a recent project and resume from the last labeled image.
- Manual annotation tools:
  - Rectangle
  - Polygon
  - Point
  - Circle
  - Line
- Polygon snapping to existing vertices and edges.
- Resize rectangle annotations by dragging corners or edges.
- Canvas zoom and pan with mouse wheel.
- Class management:
  - Add classes
  - Rename classes
  - Switch selected annotation class from the annotation list
  - Switch class with number keys: `1-9`, `0`
- Undo and redo for annotation edits.
- Autosave toggle.
- Language switch: English and Chinese.
- Export format switch: YOLO and COCO.
- ONNX-assisted labeling:
  - Load a user-provided ONNX model
  - Download preset YOLOv8 ONNX models
  - Run pre-labeling on current image
  - Run pre-labeling on all images
  - Filter ONNX suggestions by class range
  - Show download and inference progress
- Project statistics panel:
  - Per-class sample distribution
  - Unannotated image count
  - Average bbox width, height, area, and aspect ratio
  - Aspect-ratio distribution
  - Estimated remaining labeling time

## Data Formats

### YOLO Labels

Rectangle annotations are saved as YOLO txt files in the selected label folder:

```txt
class_id cx cy width height
```

All values except `class_id` are normalized to `[0, 1]`.

Example:

```txt
0 0.512000 0.438000 0.210000 0.184000
```

### Shape Sidecar Files

Non-rectangle shapes are saved in sidecar files next to YOLO labels:

```txt
image_name.superlabel.json
```

This keeps YOLO compatibility while allowing superlabel to store polygons, points, circles, and lines.

### Classes

Class names are saved in:

```txt
classes.txt
```

### COCO Export

When output format is set to COCO, superlabel writes:

```txt
annotations.json
```

Current COCO export is based on rectangle annotations.

## ONNX Models

superlabel supports YOLO-style ONNX detection outputs through the Rust backend.

Preset models include:

- YOLOv8n/s/m/l/x COCO detection
- YOLOv8n segmentation ONNX
- YOLOv8x OIV7
- YOLOv8s World v2

Notes:

- Segmentation mask decoding is not implemented yet.
- Custom text prompts for world/open-vocabulary models are not implemented yet.
- Preset downloads are restricted to the configured X-AnyLabeling release URLs.

## Tech Stack

- Tauri 2
- Rust
- SolidJS
- Konva
- Vite
- tract-onnx
- image

## Development

Install dependencies:

```bash
pnpm install
```

Run the Tauri app in development:

```bash
pnpm tauri dev
```

If the Linux desktop window crashes on Wayland with a `Gdk-Message` protocol error, run the X11 fallback:

```bash
pnpm tauri:dev:x11
```

Run only the frontend dev server:

```bash
pnpm dev
```

Build the frontend:

```bash
pnpm build
```

Build the desktop app:

```bash
pnpm tauri build
```

Linux release builds generate AppImage and deb packages. Use the AppImage on Arch Linux and CachyOS.

Check Rust code:

```bash
cd src-tauri
cargo check
```

Check TypeScript:

```bash
npx tsc --noEmit
```

## Project Structure

```txt
.
├── src
│   ├── components       # UI components and canvas interaction
│   ├── stores           # SolidJS app state
│   ├── utils            # file APIs, i18n, YOLO helpers, workspaces
│   └── types            # shared TypeScript types
├── src-tauri
│   └── src              # Rust backend commands
├── index.html
├── package.json
└── vite.config.ts
```

## Rust Backend Responsibilities

The Rust backend handles the parts that benefit from native performance and file-system access:

- Reading image folders and label files
- Writing labels, classes, shape sidecars, and COCO exports
- Image dimension detection
- ONNX model download
- ONNX model caching and inference
- Project statistics calculation

## Workspace Behavior

superlabel remembers recently opened projects locally. A workspace records:

- Image folder path
- Label folder path
- Last opened image
- Autosave setting
- Output format
- Language

Recent workspaces are stored in browser local storage inside the app runtime. They are not written as project files yet.

## Current Limitations

- COCO export currently covers rectangle annotations.
- YOLO txt files only represent rectangle annotations.
- Segmentation mask decoding is not implemented.
- Open-vocabulary prompt configuration is not implemented.
- Workspace records are local app state, not portable workspace files.

## Roadmap Ideas

- Portable `.superlabel-workspace` files.
- COCO export for polygons and other shapes.
- Segmentation mask decoding for YOLOv8-seg.
- Configurable ONNX model profiles with preprocessing/output schema presets.
- Dataset quality warnings for class imbalance, tiny boxes, and unusual aspect ratios.
- Keyboard shortcut customization.
