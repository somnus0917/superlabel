use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    cmp::Ordering,
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

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
            let (width, height) = image_dimensions(&full_path)
                .map_err(|err| format!("{}: {}", filename, err))?;

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
fn read_classes_file(folder_path: String) -> Result<String, String> {
    Ok(read_optional_string(&Path::new(&folder_path).join("classes.txt")).unwrap_or_default())
}

#[tauri::command]
fn write_classes_file(folder_path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&folder_path).join("classes.txt"), content)
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
            parse_yolo(&read_label_file(folder_path.clone(), image.filename.clone())?)
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

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|ext| IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn label_path(folder_path: &str, image_filename: &str) -> PathBuf {
    Path::new(folder_path).join(format!("{}.txt", file_stem(image_filename)))
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
    let tmp_path = path.with_file_name(format!(
        ".{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("superlabel")
    ));
    fs::write(&tmp_path, content).map_err(|err| err.to_string())?;
    fs::rename(&tmp_path, &path).map_err(|err| err.to_string())
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
    ((cx - w / 2.0) * img_w, (cy - h / 2.0) * img_h, w * img_w, h * img_h)
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
            0xc0 | 0xc1 | 0xc2 | 0xc3 | 0xc5 | 0xc6 | 0xc7 | 0xc9 | 0xca | 0xcb | 0xcd | 0xce | 0xcf
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_images_from_folder,
            read_label_file,
            write_label_file,
            read_classes_file,
            write_classes_file,
            export_coco_file,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
