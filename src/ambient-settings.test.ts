import { expect, test } from "bun:test";
import { agentServerFieldsSchema, patchAgentRequestSchema } from "./types";

test("ambient controls retain mute and disabled ducking", () => {
  expect(agentServerFieldsSchema.shape.ambientSoundVolume.parse(0)).toBe(0);
  expect(agentServerFieldsSchema.shape.ambientSoundDucking.parse(false)).toBe(false);
  expect(agentServerFieldsSchema.shape.ambientSoundVolume.safeParse(1.1).success).toBe(false);
  expect(agentServerFieldsSchema.shape.backgroundSound.parse(" keyboard ")).toBe("keyboard");
});

test("partial edits leave saved audio settings untouched", () => {
  const patch = patchAgentRequestSchema.parse({name:"Renamed",expectedUpdatedAt:"2026-09-07T12:00:00Z"});
  expect(patch).not.toHaveProperty("ambientSound");
  expect(patch).not.toHaveProperty("ambientSoundVolume");
  expect(patch).not.toHaveProperty("ambientSoundDucking");
});
