import { HealthLine } from "disaster-desk";

export const Healthy = () => <HealthLine pending={3} oldestPendingSeconds={2} />;
// Normal queue, muted mono.

export const Stuck = () => <HealthLine pending={41} oldestPendingSeconds={47} />;
// Brain stuck over 30 s: the line turns act-red.
