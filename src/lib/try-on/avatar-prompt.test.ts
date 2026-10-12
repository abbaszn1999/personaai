import { describe, expect, it } from "vitest";
import { AVATAR_BACKGROUNDS, loadAvatarBackground } from "./avatar-backgrounds";
import { buildAvatarPrompt } from "./image-generation";

const ADULT = { heightCm: 180, weightKg: 80, chestCm: 100, waistCm: 85, shoeSizeEu: 43 };

describe("buildAvatarPrompt", () => {
  const prompt = buildAvatarPrompt(ADULT, "a navy suit");

  it("treats the reference photo as identity only and discards its pose", () => {
    expect(prompt).toMatch(/IDENTITY/);
    expect(prompt).toMatch(/IGNORE/);
    expect(prompt).toMatch(/hand or arm position/);
  });

  it("bans eyeglasses and every other accessory outright", () => {
    expect(prompt).toMatch(/no eyeglasses or sunglasses/);
    expect(prompt).toMatch(/even if the person wears glasses in the reference/);
    expect(prompt).not.toMatch(/keep glasses/i);
  });

  it("fixes one standard pose, framing, lighting and backdrop", () => {
    expect(prompt).toMatch(/arms hang naturally straight down/);
    expect(prompt).toMatch(/top of the head to the soles of both shoes/);
    expect(prompt).toMatch(/no coloured lights/i);
    expect(prompt).toMatch(/BACKGROUND \(as important as the face\): .*vivid magenta studio backdrop from the second reference image/);
  });

  it("tells the model to use the second image as the background exactly as it is", () => {
    expect(prompt).toMatch(/standing in front of the studio backdrop shown in the second reference image/);
    expect(prompt).toMatch(/copied exactly as it is/);
    expect(prompt).toMatch(/Do not recolour/);
    expect(prompt).not.toMatch(/#FF00FF/);
    const sage = buildAvatarPrompt(ADULT, "a navy suit", AVATAR_BACKGROUNDS[1].name);
    expect(sage).toMatch(/the sage green studio backdrop/);
    expect(sage).not.toMatch(/magenta/);
  });

  it("has a backdrop image on disk for every avatar style", () => {
    expect(AVATAR_BACKGROUNDS.map((b) => b.id)).toEqual(["magenta", "sage", "studio-grey"]);
    for (const background of AVATAR_BACKGROUNDS) {
      expect(loadAvatarBackground(background).length).toBeGreaterThan(10_000);
    }
  });

  it("is identical across shoppers apart from body and outfit", () => {
    const other = buildAvatarPrompt({ ...ADULT, heightCm: 165, weightKg: 60 }, "a navy suit");
    const strip = (s: string) => s.split("\n\n").filter((p) => !p.startsWith("BODY:"));
    expect(strip(other)).toEqual(strip(prompt));
  });

  it("describes adults by chest and waist and children by age", () => {
    expect(prompt).toContain("chest 100 cm, waist 85 cm");
    const kid = buildAvatarPrompt({ heightCm: 120, weightKg: 22, ageYears: 6, shoeSizeEu: 31 }, "a t-shirt");
    expect(kid).toContain("child aged 6 years");
    expect(kid).not.toMatch(/chest \d/);
  });

  it("puts the style's outfit in the prompt", () => {
    expect(prompt).toContain("dressed in a navy suit");
  });
});
