import type { SpecRow } from '~/lib/specs';

export function SpecTable({ rows, fallback }: { rows: SpecRow[]; fallback: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) {
    return (
      <section className="specs" data-testid="spec-table" data-source="fallback">
        <h2>Specifications</h2>
        <p className="muted">
          No <code>specs.*</code> metafields on this product (mock.shop catalogs don&apos;t define any). Showing catalog fields instead.
        </p>
        <table>
          <tbody>
            {fallback.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
  return (
    <section className="specs" data-testid="spec-table" data-source="metafields">
      <h2>Specifications</h2>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
