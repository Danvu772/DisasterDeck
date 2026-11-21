import pilot from "../data/pilot.json";
import type { LatLng } from "./types";

export { pilot };
export const pilotCenter: LatLng = [pilot.center[0], pilot.center[1]];

export function configuredDeskId(): string {
  return process.env.DESK_ID || pilot.id;
}

/**
 * True when this deployment runs the demo (D-0017): the Start demo button, POST /api/demo/start
 * and the cast. `DEMO_DEPLOYMENT=0|1` overrides data/pilot.json (checks use it to test both).
 */
export function isDemoDeployment(): boolean {
  const env = process.env.DEMO_DEPLOYMENT;
  if (env === "0") return false;
  if (env === "1") return true;
  return (pilot as { demo?: boolean }).demo === true;
}
