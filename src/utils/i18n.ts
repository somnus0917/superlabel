import type { Language } from "../types";

const translations = {
  en: {
    annotations: "Annotations",
    autosave: "Autosave",
    classes: "Classes",
    classPrefix: "Class",
    delete: "Delete",
    dialogOpenImageFolder: "Open image folder",
    dialogOpenLabelFolder: "Open label folder",
    draw: "Draw",
    emptyDescription: "Open image and label folders to start labeling.",
    image: "Image",
    images: "Images",
    language: "Language",
    newClass: "New class",
    noAnnotations: "No annotations yet",
    noImageSelected: "No image selected",
    noImages: "No images",
    openFolders: "Open Folders",
    save: "Save",
    saved: "Saved",
    select: "Select",
    shortcuts: "Shortcuts",
  },
  zh: {
    annotations: "标注",
    autosave: "自动保存",
    classes: "类别",
    classPrefix: "类别",
    delete: "删除",
    dialogOpenImageFolder: "选择图片文件夹",
    dialogOpenLabelFolder: "选择标签文件夹",
    draw: "绘制",
    emptyDescription: "选择图片文件夹和标签文件夹后开始标注。",
    image: "图片",
    images: "图片",
    language: "语言",
    newClass: "新类别",
    noAnnotations: "暂无标注",
    noImageSelected: "未选择图片",
    noImages: "暂无图片",
    openFolders: "打开文件夹",
    save: "保存",
    saved: "已保存",
    select: "选择",
    shortcuts: "快捷键",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function tr(language: Language, key: TranslationKey) {
  return translations[language][key] ?? translations.en[key];
}
