import { describe, expect, it } from "vitest";
import { MAX_RENDER_PIXELS, boundedRenderSize } from "./renderSize";

describe("boundedRenderSize", () => {
  it("preserves ordinary viewport dimensions", () => {
    expect(boundedRenderSize(1280, 720)).toEqual({ width: 1280, height: 720 });
  });

  it("caps a 4K framebuffer while preserving its aspect ratio", () => {
    const size = boundedRenderSize(3840, 2160);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
  });
});
