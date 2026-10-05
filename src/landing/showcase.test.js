// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import showcase from "@shared/data/showcase.json";
import { thumbSrc } from "./showcase.js";

const PUBLIC = fileURLToPath(new URL("../../public", import.meta.url));

describe("landing showcase", () => {
  it.each(showcase.items.map((item) => [item.file, item]))("%s ships its photo and thumbnail", (_, item) => {
    expect(fs.existsSync(path.join(PUBLIC, item.src))).toBe(true);
    expect(fs.existsSync(path.join(PUBLIC, thumbSrc(item)))).toBe(true);
  });

  it("opens on a photo with marks to draw", () => {
    expect(showcase.items[0].detections.length).toBeGreaterThan(0);
    expect(showcase.items.every((item) => item.detections.length > 0)).toBe(true);
  });
});
