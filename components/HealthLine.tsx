// "queue: 3 waiting, oldest 2 s". Red only when the Brain is stuck (> 30 s).
export function HealthLine({ pending, oldestPendingSeconds }: {
  pending: number; oldestPendingSeconds: number;
}) {
  const stuck = oldestPendingSeconds > 30;
  return (
    <p className={`font-mono text-xs ${stuck ? "font-semibold text-act" : "text-muted"}`}>
      queue: {pending} waiting, oldest {oldestPendingSeconds} s
    </p>
  );
}
