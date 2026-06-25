import { describe, it, expect } from "vitest";
import { binaryToDataUrl } from "../src/adapter";

describe("binaryToDataUrl", () => {
  it("builds a data url from bytes + extension", () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(binaryToDataUrl(bytes, "png")).toMatch(/^data:image\/png;base64,/);
  });
});
