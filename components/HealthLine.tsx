// "Queue: 3 waiting, oldest 2 seconds". Red only when the Brain is stuck (> 30 s).
export function HealthLine({ pending, oldestPendingSeconds, failed = 0 }: {
  pending: number; oldestPendingSeconds: number; failed?: number;
}) {
  const stuck = oldestPendingSeconds > 30;
  return (
    <p className={`text-sm ${stuck ? "font-bold text-act" : "text-muted"}`}>
      Queue: {pending} waiting, oldest {oldestPendingSeconds} {oldestPendingSeconds === 1 ? "second" : "seconds"}
      {failed > 0 && `, ${failed} failed`}
    </p>
  );
}
