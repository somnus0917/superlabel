use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    cmp::Ordering,
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, State, Window};
use tract_onnx::prelude::*;
use tract_onnx::tract_core::dims;

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "bmp", "webp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BBox {
    id: String,
    cx: f64,
    cy: f64,
    w: f64,
    h: f64,
    class_id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnotationClass {
    id: u32,
    name: String,
    color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageEntry {
    filename: String,
    full_path: String,
    annotated: bool,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total: Option<u64>,
    done: bool,
}

#[derive(Debug, Clone)]
struct DetectionCandidate {
    class_id: u32,
    confidence: f32,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

struct Letterbox {
    scale: f32,
    pad_x: f32,
    pad_y: f32,
    original_width: f32,
    original_height: f32,
    input_size: u32,
}

struct CachedOnnxModel {
    path: String,
    input_size: u32,
    model: Arc<TypedRunnableModel>,
}

#[derive(Default)]
struct OnnxState {
    cached_model: Mutex<Option<CachedOnnxModel>>,
}

#[tauri::command]
fn load_images_from_folder(
    image_folder_path: String,
    label_folder_path: String,
) -> Result<Vec<ImageEntry>, String> {
    let mut filenames = Vec::new();
    for entry in fs::read_dir(&image_folder_path).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_file() || !is_image_file(&path) {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            filenames.push(name.to_string());
        }
    }

    filenames.sort_by(|left, right| natural_cmp(left, right));

    filenames
        .into_iter()
        .map(|filename| {
            let full_path = Path::new(&image_folder_path).join(&filename);
            let label_path = label_path(&label_folder_path, &filename);
            let annotated = read_optional_string(&label_path)
                .map(|content| !content.trim().is_empty())
                .unwrap_or(false);
            let (width, height) =
                image_dimensions(&full_path).map_err(|err| format!("{}: {}", filename, err))?;

            Ok(ImageEntry {
                filename,
                full_path: full_path.to_string_lossy().to_string(),
                annotated,
                width,
                height,
            })
        })
        .collect()
}

#[tauri::command]
fn read_label_file(folder_path: String, image_filename: String) -> Result<String, String> {
    Ok(read_optional_string(&label_path(&folder_path, &image_filename)).unwrap_or_default())
}

#[tauri::command]
fn write_label_file(
    folder_path: String,
    image_filename: String,
    content: String,
) -> Result<(), String> {
    atomic_write(label_path(&folder_path, &image_filename), content)
}

#[tauri::command]
fn read_shapes_file(folder_path: String, image_filename: String) -> Result<String, String> {
    Ok(read_optional_string(&shape_path(&folder_path, &image_filename)).unwrap_or_default())
}

#[tauri::command]
fn write_shapes_file(
    folder_path: String,
    image_filename: String,
    content: String,
) -> Result<(), String> {
    atomic_write(shape_path(&folder_path, &image_filename), content)
}

#[tauri::command]
fn read_classes_file(folder_path: String) -> Result<String, String> {
    Ok(read_optional_string(&Path::new(&folder_path).join("classes.txt")).unwrap_or_default())
}

#[tauri::command]
fn write_classes_file(folder_path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&folder_path).join("classes.txt"), content)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|err| err.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    atomic_write(PathBuf::from(path), content)
}

#[tauri::command]
async fn download_model_file(
    window: Window,
    url: String,
    destination_path: String,
    progress_id: String,
) -> Result<String, String> {
    if !url.starts_with("https://github.com/CVHub520/X-AnyLabeling/releases/download/") {
        return Err("unsupported model URL".to_string());
    }

    let mut response = reqwest::get(&url).await.map_err(|err| err.to_string())?;
    if !response.status().is_success() {
        return Err(format!("download failed: {}", response.status()));
    }
    let total = response.content_length();
    let destination = PathBuf::from(destination_path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let tmp_path = temp_path_for(&destination);
    let mut file = fs::File::create(&tmp_path).map_err(|err| err.to_string())?;
    let mut downloaded = 0u64;
    emit_download_progress(&window, &progress_id, downloaded, total, false)?;

    while let Some(chunk) = response.chunk().await.map_err(|err| err.to_string())? {
        file.write_all(&chunk).map_err(|err| err.to_string())?;
        downloaded += chunk.len() as u64;
        emit_download_progress(&window, &progress_id, downloaded, total, false)?;
    }
    file.flush().map_err(|err| err.to_string())?;
    fs::rename(&tmp_path, &destination).map_err(|err| err.to_string())?;
    emit_download_progress(&window, &progress_id, downloaded, total, true)?;

    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn export_coco_file(
    folder_path: String,
    images: Vec<ImageEntry>,
    classes: Vec<AnnotationClass>,
    current_image_filename: String,
    current_boxes: Vec<BBox>,
) -> Result<(), String> {
    let mut annotation_id = 1u32;

    let coco_images: Vec<_> = images
        .iter()
        .enumerate()
        .map(|(index, image)| {
            json!({
                "id": index + 1,
                "file_name": image.filename,
                "width": image.width,
                "height": image.height,
            })
        })
        .collect();

    let mut annotations = Vec::new();
    for (image_index, image) in images.iter().enumerate() {
        let boxes = if image.filename == current_image_filename {
            current_boxes.clone()
        } else {
            parse_yolo(&read_label_file(
                folder_path.clone(),
                image.filename.clone(),
            )?)
        };

        for bbox in boxes {
            let (x, y, width, height) =
                yolo_to_pixel(bbox.cx, bbox.cy, bbox.w, bbox.h, image.width, image.height);
            annotations.push(json!({
                "id": annotation_id,
                "image_id": image_index + 1,
                "category_id": bbox.class_id,
                "bbox": [round3(x), round3(y), round3(width), round3(height)],
                "area": round3(width * height),
                "iscrowd": 0,
                "segmentation": [],
            }));
            annotation_id += 1;
        }
    }

    let categories: Vec<_> = classes
        .iter()
        .map(|item| {
            json!({
                "id": item.id,
                "name": item.name,
                "supercategory": "object",
            })
        })
        .collect();

    let content = serde_json::to_string_pretty(&json!({
        "info": {
            "description": "superlabel COCO annotations",
        },
        "images": coco_images,
        "annotations": annotations,
        "categories": categories,
    }))
    .map_err(|err| err.to_string())?;

    atomic_write(Path::new(&folder_path).join("annotations.json"), content)
}

#[tauri::command]
fn run_onnx_detection(
    state: State<'_, OnnxState>,
    model_path: String,
    image_path: String,
    input_size: u32,
    confidence: f32,
    nms: f32,
    class_count: usize,
    class_min: u32,
    class_max: u32,
) -> Result<Vec<BBox>, String> {
    let input_size = input_size.max(32);
    let (input_tensor, letterbox) = prepare_onnx_input(&image_path, input_size)?;
    let model = cached_onnx_model(&state, &model_path, input_size)?;

    let outputs = model
        .run(tvec!(input_tensor.into_tvalue()))
        .map_err(|err| err.to_string())?;
    let output = outputs
        .first()
        .ok_or_else(|| "model returned no output".to_string())?
        .to_plain_array_view::<f32>()
        .map_err(|err| err.to_string())?;

    let mut candidates = decode_yolo_output(
        output.shape(),
        output.as_slice().ok_or("non-contiguous output")?,
        confidence,
        class_count,
        class_min,
        class_max,
        &letterbox,
    )?;
    candidates.sort_by(|left, right| {
        right
            .confidence
            .partial_cmp(&left.confidence)
            .unwrap_or(Ordering::Equal)
    });
    let detections = nms_detections(candidates, nms);

    Ok(detections
        .into_iter()
        .enumerate()
        .map(|(index, detection)| BBox {
            id: format!("onnx-{}-{}", detection.class_id, index),
            class_id: detection.class_id,
            cx: clamp01((detection.x + detection.width / 2.0) as f64),
            cy: clamp01((detection.y + detection.height / 2.0) as f64),
            w: clamp01(detection.width as f64),
            h: clamp01(detection.height as f64),
        })
        .collect())
}

fn cached_onnx_model(
    state: &State<'_, OnnxState>,
    model_path: &str,
    input_size: u32,
) -> Result<Arc<TypedRunnableModel>, String> {
    let mut cached_model = state
        .cached_model
        .lock()
        .map_err(|_| "ONNX model cache is unavailable".to_string())?;

    if let Some(cached) = cached_model.as_ref() {
        if cached.path == model_path && cached.input_size == input_size {
            return Ok(Arc::clone(&cached.model));
        }
    }

    let model = tract_onnx::onnx()
        .model_for_path(model_path)
        .map_err(|err| err.to_string())?
        .with_input_fact(
            0,
            f32::fact(dims!(1, 3, input_size as usize, input_size as usize)).into(),
        )
        .map_err(|err| err.to_string())?
        .into_optimized()
        .map_err(|err| err.to_string())?
        .into_runnable()
        .map_err(|err| err.to_string())?;

    *cached_model = Some(CachedOnnxModel {
        path: model_path.to_string(),
        input_size,
        model: Arc::clone(&model),
    });

    Ok(model)
}

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn label_path(folder_path: &str, image_filename: &str) -> PathBuf {
    Path::new(folder_path).join(format!("{}.txt", file_stem(image_filename)))
}

fn shape_path(folder_path: &str, image_filename: &str) -> PathBuf {
    Path::new(folder_path).join(format!("{}.superlabel.json", file_stem(image_filename)))
}

fn file_stem(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(filename)
        .to_string()
}

fn read_optional_string(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    fs::read_to_string(path).ok()
}

fn atomic_write(path: PathBuf, content: String) -> Result<(), String> {
    atomic_write_bytes(&path, content.as_bytes())
}

fn atomic_write_bytes(path: &Path, content: &[u8]) -> Result<(), String> {
    let tmp_path = temp_path_for(path);
    fs::write(&tmp_path, content).map_err(|err| err.to_string())?;
    fs::rename(&tmp_path, path).map_err(|err| err.to_string())
}

fn temp_path_for(path: &Path) -> PathBuf {
    path.with_file_name(format!(
        ".{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("superlabel")
    ))
}

fn emit_download_progress(
    window: &Window,
    id: &str,
    downloaded: u64,
    total: Option<u64>,
    done: bool,
) -> Result<(), String> {
    window
        .emit(
            "model-download-progress",
            DownloadProgress {
                id: id.to_string(),
                downloaded,
                total,
                done,
            },
        )
        .map_err(|err| err.to_string())
}

fn natural_cmp(left: &str, right: &str) -> Ordering {
    let mut left_chars = left.chars().peekable();
    let mut right_chars = right.chars().peekable();

    loop {
        match (left_chars.peek(), right_chars.peek()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(left_char), Some(right_char)) => {
                if left_char.is_ascii_digit() && right_char.is_ascii_digit() {
                    let left_number = take_number(&mut left_chars);
                    let right_number = take_number(&mut right_chars);
                    let ordering = left_number.cmp(&right_number);
                    if ordering != Ordering::Equal {
                        return ordering;
                    }
                    continue;
                }

                let left_lower = left_char.to_ascii_lowercase();
                let right_lower = right_char.to_ascii_lowercase();
                let ordering = left_lower.cmp(&right_lower);
                left_chars.next();
                right_chars.next();
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
        }
    }
}

fn take_number(chars: &mut std::iter::Peekable<std::str::Chars<'_>>) -> u64 {
    let mut value = 0u64;
    while let Some(ch) = chars.peek() {
        if !ch.is_ascii_digit() {
            break;
        }
        value = value
            .saturating_mul(10)
            .saturating_add(ch.to_digit(10).unwrap_or(0) as u64);
        chars.next();
    }
    value
}

fn parse_yolo(text: &str) -> Vec<BBox> {
    text.lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let values: Vec<_> = line.split_whitespace().collect();
            if values.len() < 5 {
                return None;
            }
            Some(BBox {
                id: format!("box-rust-{}", index),
                class_id: values[0].parse().ok()?,
                cx: clamp01(values[1].parse().ok()?),
                cy: clamp01(values[2].parse().ok()?),
                w: clamp01(values[3].parse().ok()?),
                h: clamp01(values[4].parse().ok()?),
            })
        })
        .collect()
}

fn clamp01(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

fn yolo_to_pixel(cx: f64, cy: f64, w: f64, h: f64, img_w: u32, img_h: u32) -> (f64, f64, f64, f64) {
    let img_w = img_w as f64;
    let img_h = img_h as f64;
    (
        (cx - w / 2.0) * img_w,
        (cy - h / 2.0) * img_h,
        w * img_w,
        h * img_h,
    )
}

fn prepare_onnx_input(image_path: &str, input_size: u32) -> Result<(Tensor, Letterbox), String> {
    let image = image::open(image_path)
        .map_err(|err| err.to_string())?
        .to_rgb8();
    let (original_width, original_height) = image.dimensions();
    let scale =
        (input_size as f32 / original_width as f32).min(input_size as f32 / original_height as f32);
    let resized_width = (original_width as f32 * scale).round().max(1.0) as u32;
    let resized_height = (original_height as f32 * scale).round().max(1.0) as u32;
    let pad_x = ((input_size - resized_width) / 2) as f32;
    let pad_y = ((input_size - resized_height) / 2) as f32;

    let resized = image::imageops::resize(
        &image,
        resized_width,
        resized_height,
        image::imageops::FilterType::Triangle,
    );
    let mut values = vec![114.0f32 / 255.0; (3 * input_size * input_size) as usize];

    for y in 0..resized_height {
        for x in 0..resized_width {
            let pixel = resized.get_pixel(x, y);
            let dst_x = x + pad_x as u32;
            let dst_y = y + pad_y as u32;
            let plane_size = (input_size * input_size) as usize;
            let offset = (dst_y * input_size + dst_x) as usize;
            values[offset] = pixel[0] as f32 / 255.0;
            values[plane_size + offset] = pixel[1] as f32 / 255.0;
            values[2 * plane_size + offset] = pixel[2] as f32 / 255.0;
        }
    }

    let tensor = Tensor::from_shape(&[1, 3, input_size as usize, input_size as usize], &values)
        .map_err(|err| err.to_string())?;

    Ok((
        tensor,
        Letterbox {
            scale,
            pad_x,
            pad_y,
            original_width: original_width as f32,
            original_height: original_height as f32,
            input_size,
        },
    ))
}

fn decode_yolo_output(
    shape: &[usize],
    values: &[f32],
    confidence_threshold: f32,
    class_count: usize,
    class_min: u32,
    class_max: u32,
    letterbox: &Letterbox,
) -> Result<Vec<DetectionCandidate>, String> {
    if shape.len() != 3 || shape[0] != 1 {
        return Err(format!("unsupported output shape: {:?}", shape));
    }

    let dim1 = shape[1];
    let dim2 = shape[2];
    let dim1_attr_score = yolo_attr_score(dim1, dim2, class_count);
    let dim2_attr_score = yolo_attr_score(dim2, dim1, class_count);

    if dim2_attr_score >= dim1_attr_score && dim2_attr_score > 0 {
        Ok(decode_yolo_rows(
            values,
            dim1,
            dim2,
            |row, col| values[row * dim2 + col],
            confidence_threshold,
            class_count,
            class_min,
            class_max,
            letterbox,
        ))
    } else if dim1_attr_score > 0 {
        Ok(decode_yolo_rows(
            values,
            dim2,
            dim1,
            |row, col| values[col * dim2 + row],
            confidence_threshold,
            class_count,
            class_min,
            class_max,
            letterbox,
        ))
    } else {
        Err(format!("unsupported output shape: {:?}", shape))
    }
}

fn yolo_attr_score(candidate_attrs: usize, candidate_rows: usize, class_count: usize) -> u8 {
    if candidate_attrs < 5 {
        return 0;
    }
    if class_count > 0 && (candidate_attrs == class_count + 4 || candidate_attrs == class_count + 5)
    {
        return 4;
    }
    if candidate_attrs <= 128 && candidate_rows > candidate_attrs {
        return 2;
    }
    if candidate_attrs <= 512 {
        return 1;
    }
    0
}

fn yolo_has_objectness(attrs: usize, class_count: usize) -> bool {
    if class_count > 0 {
        if attrs == class_count + 5 {
            return true;
        }
        if attrs == class_count + 4 {
            return false;
        }
    }
    attrs == 6 || attrs == 85
}

fn decode_yolo_rows<F>(
    _values: &[f32],
    rows: usize,
    attrs: usize,
    value_at: F,
    confidence_threshold: f32,
    class_count: usize,
    class_min: u32,
    class_max: u32,
    letterbox: &Letterbox,
) -> Vec<DetectionCandidate>
where
    F: Fn(usize, usize) -> f32,
{
    let has_objectness = yolo_has_objectness(attrs, class_count);
    let class_start = if has_objectness { 5 } else { 4 };
    let mut detections = Vec::new();

    for row in 0..rows {
        if attrs <= class_start {
            continue;
        }

        let cx = value_at(row, 0);
        let cy = value_at(row, 1);
        let width = value_at(row, 2);
        let height = value_at(row, 3);
        let objectness = if has_objectness {
            value_at(row, 4)
        } else {
            1.0
        };

        let mut best_class = 0usize;
        let mut best_score = 0.0f32;
        for class_index in class_start..attrs {
            let score = value_at(row, class_index);
            if score > best_score {
                best_score = score;
                best_class = class_index - class_start;
            }
        }

        let confidence = objectness * best_score;
        if confidence < confidence_threshold {
            continue;
        }
        let class_id = best_class as u32;
        if class_id < class_min || class_id > class_max {
            continue;
        }

        if let Some(candidate) =
            candidate_from_model_box(cx, cy, width, height, class_id, confidence, letterbox)
        {
            detections.push(candidate);
        }
    }

    detections
}

fn candidate_from_model_box(
    cx: f32,
    cy: f32,
    width: f32,
    height: f32,
    class_id: u32,
    confidence: f32,
    letterbox: &Letterbox,
) -> Option<DetectionCandidate> {
    let scale_factor = if cx <= 1.5 && cy <= 1.5 && width <= 1.5 && height <= 1.5 {
        letterbox.input_size as f32
    } else {
        1.0
    };

    let left = cx * scale_factor - width * scale_factor / 2.0;
    let top = cy * scale_factor - height * scale_factor / 2.0;
    let box_width = width * scale_factor;
    let box_height = height * scale_factor;

    let x = (left - letterbox.pad_x) / letterbox.scale;
    let y = (top - letterbox.pad_y) / letterbox.scale;
    let w = box_width / letterbox.scale;
    let h = box_height / letterbox.scale;

    let x1 = x.max(0.0).min(letterbox.original_width);
    let y1 = y.max(0.0).min(letterbox.original_height);
    let x2 = (x + w).max(0.0).min(letterbox.original_width);
    let y2 = (y + h).max(0.0).min(letterbox.original_height);
    let final_width = x2 - x1;
    let final_height = y2 - y1;

    if final_width <= 1.0 || final_height <= 1.0 {
        return None;
    }

    Some(DetectionCandidate {
        class_id,
        confidence,
        x: x1 / letterbox.original_width,
        y: y1 / letterbox.original_height,
        width: final_width / letterbox.original_width,
        height: final_height / letterbox.original_height,
    })
}

fn nms_detections(
    mut detections: Vec<DetectionCandidate>,
    threshold: f32,
) -> Vec<DetectionCandidate> {
    let mut kept = Vec::new();
    while let Some(candidate) = detections.first().cloned() {
        detections.remove(0);
        detections.retain(|other| {
            other.class_id != candidate.class_id || bbox_iou(&candidate, other) < threshold
        });
        kept.push(candidate);
    }
    kept
}

fn bbox_iou(left: &DetectionCandidate, right: &DetectionCandidate) -> f32 {
    let left_x2 = left.x + left.width;
    let left_y2 = left.y + left.height;
    let right_x2 = right.x + right.width;
    let right_y2 = right.y + right.height;

    let inter_x1 = left.x.max(right.x);
    let inter_y1 = left.y.max(right.y);
    let inter_x2 = left_x2.min(right_x2);
    let inter_y2 = left_y2.min(right_y2);
    let inter_w = (inter_x2 - inter_x1).max(0.0);
    let inter_h = (inter_y2 - inter_y1).max(0.0);
    let inter_area = inter_w * inter_h;
    let union_area = left.width * left.height + right.width * right.height - inter_area;
    if union_area <= 0.0 {
        0.0
    } else {
        inter_area / union_area
    }
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn image_dimensions(path: &Path) -> Result<(u32, u32), String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    png_dimensions(&bytes)
        .or_else(|| jpeg_dimensions(&bytes))
        .or_else(|| bmp_dimensions(&bytes))
        .or_else(|| webp_dimensions(&bytes))
        .ok_or_else(|| "unsupported or corrupt image".to_string())
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xff || bytes[1] != 0xd8 {
        return None;
    }

    let mut index = 2;
    while index + 3 < bytes.len() {
        while index < bytes.len() && bytes[index] != 0xff {
            index += 1;
        }
        while index < bytes.len() && bytes[index] == 0xff {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }

        let marker = bytes[index];
        index += 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if index + 1 >= bytes.len() {
            break;
        }

        let segment_len = u16::from_be_bytes([bytes[index], bytes[index + 1]]) as usize;
        if segment_len < 2 || index + segment_len > bytes.len() {
            break;
        }

        let is_sof = matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        );
        if is_sof && segment_len >= 7 {
            let height = u16::from_be_bytes([bytes[index + 3], bytes[index + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[index + 5], bytes[index + 6]]) as u32;
            return Some((width, height));
        }

        index += segment_len;
    }
    None
}

fn bmp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 26 || &bytes[0..2] != b"BM" {
        return None;
    }
    let width = i32::from_le_bytes(bytes[18..22].try_into().ok()?);
    let height = i32::from_le_bytes(bytes[22..26].try_into().ok()?);
    Some((width.unsigned_abs(), height.unsigned_abs()))
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }

    let mut index = 12;
    while index + 8 <= bytes.len() {
        let chunk = &bytes[index..index + 4];
        let size = u32::from_le_bytes(bytes[index + 4..index + 8].try_into().ok()?) as usize;
        let data_start = index + 8;
        let data_end = data_start.saturating_add(size);
        if data_end > bytes.len() {
            return None;
        }
        let data = &bytes[data_start..data_end];

        if chunk == b"VP8X" && data.len() >= 10 {
            let width = 1 + read_u24_le(&data[4..7])?;
            let height = 1 + read_u24_le(&data[7..10])?;
            return Some((width, height));
        }
        if chunk == b"VP8L" && data.len() >= 5 && data[0] == 0x2f {
            let width = 1 + (((data[2] as u32 & 0x3f) << 8) | data[1] as u32);
            let height = 1
                + (((data[4] as u32 & 0x0f) << 10)
                    | ((data[3] as u32) << 2)
                    | ((data[2] as u32 & 0xc0) >> 6));
            return Some((width, height));
        }
        if chunk == b"VP8 " && data.len() >= 10 && data[3..6] == [0x9d, 0x01, 0x2a] {
            let width = u16::from_le_bytes([data[6], data[7]]) as u32 & 0x3fff;
            let height = u16::from_le_bytes([data[8], data[9]]) as u32 & 0x3fff;
            return Some((width, height));
        }

        index = data_end + (size % 2);
    }
    None
}

fn read_u24_le(bytes: &[u8]) -> Option<u32> {
    if bytes.len() < 3 {
        return None;
    }
    Some(bytes[0] as u32 | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OnnxState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_images_from_folder,
            read_label_file,
            write_label_file,
            read_shapes_file,
            write_shapes_file,
            read_classes_file,
            write_classes_file,
            read_text_file,
            write_text_file,
            download_model_file,
            export_coco_file,
            run_onnx_detection,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
