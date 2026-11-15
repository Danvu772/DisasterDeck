import type { Tone } from "../types";
import { toneBg } from "./tone";

export function Snapshot({ rows }: { rows: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-line last:border-b-0">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">{r.label}</th>
            <td className="py-1.5 text-right">
              <span className="inline-flex items-center gap-2">
                {r.tone && <span aria-hidden className={`inline-block h-2 w-2 ${toneBg(r.tone)}`} />}
                <span className="font-mono">{r.value}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
