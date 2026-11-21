import pilot from "../../data/pilot.json";
import type { LatLng } from "./types";

export { pilot };
export const pilotCenter: LatLng = [pilot.center[0], pilot.center[1]];

export function configuredDeskId(): string {
  return process.env.DESK_ID || pilot.id;
}
