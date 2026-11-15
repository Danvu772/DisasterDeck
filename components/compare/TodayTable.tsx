import type { Row } from "./adapt";

// What volunteers had in 2023: a plain sheet. The last two columns are empty on purpose.
export function TodayTable({ rows }: { rows: Row[] }) {
  const th = "border border-line bg-paper px-2 py-1 text-left text-xs font-bold";
  const td = "border border-line px-2 py-1 align-top text-xs";
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-12" /><col /><col className="w-20" /><col className="w-14" /><col className="w-16" />
      </colgroup>
      <thead>
        <tr>
          <th className={th}>Time</th><th className={th}>Text</th><th className={th}>Address</th>
          <th className={th}>Called?</th><th className={th}>Who is on it?</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={`${td} whitespace-nowrap`}>{r.time}</td>
            <td className={td}>
              <p>{r.textEn}</p>
              <p className="mt-0.5 text-muted">{r.text}</p>
            </td>
            <td className={td}>{r.address}</td>
            <td className={td} />
            <td className={td} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
