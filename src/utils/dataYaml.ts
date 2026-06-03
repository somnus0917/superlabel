import type { AnnotationClass } from "../types";

export function generateDataYaml(
  imageFolderPath: string,
  classes: AnnotationClass[],
): string {
  const names = classes.map((item) => item.name);
  return [
    `path: ${imageFolderPath}`,
    "train: images",
    "val: images",
    "",
    `nc: ${classes.length}`,
    `names: [${names.map((name) => JSON.stringify(name)).join(", ")}]`,
  ].join("\n");
}
