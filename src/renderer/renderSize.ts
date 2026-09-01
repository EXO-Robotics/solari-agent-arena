export const MAX_RENDER_PIXELS = 2_000_000;

export function boundedRenderSize(width: number, height: number, maxPixels = MAX_RENDER_PIXELS): { width: number; height: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(1, Math.sqrt(maxPixels / (safeWidth * safeHeight)));
  return {
    width: Math.max(1, Math.floor(safeWidth * scale)),
    height: Math.max(1, Math.floor(safeHeight * scale)),
  };
}
