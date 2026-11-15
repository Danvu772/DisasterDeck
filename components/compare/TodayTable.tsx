import type { Row } from "./adapt";

// What volunteers had in 2023: a plain sheet. The last two columns are empty on purpose.
export function TodayTable({ rows }: { rows: Row[] }) {
  const th = "px-3 py-2 text-left text-xs font-medium text-muted-foreground";
  const td = "px-3 py-2.5 align-top text-xs";
  const blank = <span className="text-muted-foreground/50">—</span>;
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col className="w-16" /><col /><col className="w-24" /><col className="w-16" /><col className="w-20" />
        </colgroup>
        <thead className="border-b bg-secondary/60">
          <tr>
            <th className={th}>Time</th><th className={th}>Post</th><th className={th}>Address</th>
            <th className={th}>Called?</th><th className={th}>Who is on it?</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={`${td} whitespace-nowrap font-mono text-muted-foreground`}>{r.time}</td>
              <td className={td}>
                <p className="text-sm leading-snug">{r.textEn}</p>
                <p className="mt-1 text-muted-foreground" lang="tr">{r.text}</p>
              </td>
              <td className={td}>{r.address}</td>
              <td className={td}>{blank}</td>
              <td className={td}>{blank}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
