import type { Box2D } from "./types";

export type Rect = { x: number; y: number; width: number; height: number };

export type ContainPlacement = Rect & { offsetX: number; offsetY: number; scale: number };

export function validBox(box: Box2D | null | undefined): box is Box2D {
  if (!box || box.length !== 4) return false;
  const [yMin, xMin, yMax, xMax] = box;
  const values = [yMin, xMin, yMax, xMax];
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 1000)) return false;
  return yMax > yMin && xMax > xMin;
}

/** Image-space rectangle from Gemini's [yMin, xMin, yMax, xMax] 0–1000 box. */
export function sourceRect(box: Box2D, imageWidth: number, imageHeight: number): Rect {
  if (!validBox(box)) throw new Error("Invalid box.");
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error("Invalid image size.");
  const [yMin, xMin, yMax, xMax] = box;
  const x = (xMin / 1000) * imageWidth;
  const y = (yMin / 1000) * imageHeight;
  const width = ((xMax - xMin) / 1000) * imageWidth;
  const height = ((yMax - yMin) / 1000) * imageHeight;
  return { x, y, width, height };
}

export function containPlacement(containerWidth: number, containerHeight: number, imageWidth: number, imageHeight: number): ContainPlacement {
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const offsetX = (containerWidth - width) / 2;
  const offsetY = (containerHeight - height) / 2;
  return { x: offsetX, y: offsetY, width, height, offsetX, offsetY, scale };
}

export function displayRect(box: Box2D, imageWidth: number, imageHeight: number, containerWidth: number, containerHeight: number): Rect {
  const source = sourceRect(box, imageWidth, imageHeight);
  const contain = containPlacement(containerWidth, containerHeight, imageWidth, imageHeight);
  return {
    x: contain.offsetX + source.x * contain.scale,
    y: contain.offsetY + source.y * contain.scale,
    width: source.width * contain.scale,
    height: source.height * contain.scale,
  };
}

export function boxFromImageRect(rect: Rect, imageWidth: number, imageHeight: number): Box2D {
  const xMin = clampInt((rect.x / imageWidth) * 1000, 0, 999);
  const yMin = clampInt((rect.y / imageHeight) * 1000, 0, 999);
  const xMax = clampInt(((rect.x + rect.width) / imageWidth) * 1000, xMin + 1, 1000);
  const yMax = clampInt(((rect.y + rect.height) / imageHeight) * 1000, yMin + 1, 1000);
  return [yMin, xMin, yMax, xMax];
}

export function boxAroundPoint(xNorm: number, yNorm: number, widthNorm = 280, heightNorm = 420): Box2D {
  const x = clampInt(Math.round(xNorm), 0, 1000);
  const y = clampInt(Math.round(yNorm), 0, 1000);
  const xMin = clampInt(x - Math.round(widthNorm / 2), 0, 999);
  const yMin = clampInt(y - Math.round(heightNorm / 2), 0, 999);
  const xMax = clampInt(xMin + widthNorm, xMin + 1, 1000);
  const yMax = clampInt(yMin + heightNorm, yMin + 1, 1000);
  return [yMin, xMin, yMax, xMax];
}

export function paddedEllipse(rect: Rect, padRatio = 0.08): Rect {
  const padX = rect.width * padRatio;
  const padY = rect.height * padRatio;
  return {
    x: rect.x - padX,
    y: rect.y - padY,
    width: rect.width + padX * 2,
    height: rect.height + padY * 2,
  };
}

export function pointInside(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
