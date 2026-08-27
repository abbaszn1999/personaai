import type { PersonaSkill } from "../../skill";

export { askForMissingInfo, type MissingInfo } from "./run";

export const askSkill: PersonaSkill = {
  mode: "ask_info",
};
