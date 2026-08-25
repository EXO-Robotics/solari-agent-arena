import { describe, expect, it } from "vitest";
import {
  PHYSICS_ACTUATOR_NAMES,
  PHYSICS_BODY_NAMES,
  PHYSICS_MODEL_XML,
  PHYSICS_NAMED_GEOMS,
  PHYSICS_XML_BYTES,
  PHYSICS_XML_SHA256,
  namedXmlActuators,
  namedXmlBodies,
  namedXmlGeoms,
} from "./physicsBaseline";
import { VISUAL_LINK_NAMES, VISUAL_LINKS } from "./visualContract";

describe("physics baseline freeze", () => {
  it("keeps the trainer XML byte length unchanged", () => {
    expect(new TextEncoder().encode(PHYSICS_MODEL_XML).length).toBe(PHYSICS_XML_BYTES);
  });

  it("keeps the trainer XML content hash unchanged", async () => {
    const bytes = new TextEncoder().encode(PHYSICS_MODEL_XML);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    expect(actual).toBe(PHYSICS_XML_SHA256);
  });

  it("keeps the 13 named bodies in contract order", () => {
    expect(namedXmlBodies()).toEqual([...PHYSICS_BODY_NAMES]);
    expect(PHYSICS_BODY_NAMES).toEqual([...VISUAL_LINK_NAMES]);
  });

  it("keeps named geoms and trainer actuators unchanged", () => {
    expect(namedXmlGeoms()).toEqual([...PHYSICS_NAMED_GEOMS]);
    expect(namedXmlActuators()).toEqual([...PHYSICS_ACTUATOR_NAMES]);
    expect(PHYSICS_NAMED_GEOMS).toHaveLength(35);
    expect(PHYSICS_ACTUATOR_NAMES).toHaveLength(20);
  });

  it("does not add decorative geoms as a visual shortcut", () => {
    expect(PHYSICS_MODEL_XML).toContain('contype="0" conaffinity="0"');
    expect(PHYSICS_MODEL_XML).toContain('name="balance_height"');
    expect(PHYSICS_MODEL_XML).not.toContain("visual_mesh");
  });
});

describe("visual contract", () => {
  it("covers every body with rest poses and hulls", () => {
    expect(VISUAL_LINKS.map((link) => link.name)).toEqual([...VISUAL_LINK_NAMES]);
    expect(VISUAL_LINKS[0]?.restWorld).toEqual([0, 0, 0.89]);
    expect(VISUAL_LINKS.find((link) => link.name === "left_foot")?.padding).toBe(0.008);
  });
});
