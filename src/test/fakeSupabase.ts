import type { SupabaseClient } from "@supabase/supabase-js";

// In-memory stand-in for the Supabase query builder, for tests without network.
// Covers the calls src/data/puzzles.ts makes (select / insert / update / delete with
// eq, in, order, range) and mimics the puzzles table's Row Level Security:
// - "public" (publishable key): sees published rows only, and every write is
//   refused with 42501, since the migration grants this role SELECT and nothing else.
// - "secret" (secret key): full access.
// It also rejects a duplicate primary key like Postgres (23505).

type Row = Record<string, unknown>;
type Role = "public" | "secret";
type Result = { data: Row[] | null; error: { code: string; message: string } | null; status: number };

export interface FakeTable {
  rows: Row[];
  /** Every request, for assertions: role, operation and filters. */
  log: { role: Role; op: string; filters: string[] }[];
  /** Makes the next request fail with this error. */
  failNext?: { code: string; message: string };
}

export function fakeTable(rows: Row[] = []): FakeTable {
  return { rows: rows.map((r) => ({ ...r })), log: [] };
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row[] | Row = [];
  private filters: { label: string; test: (r: Row) => boolean }[] = [];
  private window: [number, number] | null = null;
  private orderBy: string | null = null;

  constructor(
    private readonly table: FakeTable,
    private readonly role: Role,
  ) {}

  select() {
    return this; // after insert/update/delete it only asks for the affected rows back
  }
  insert(rows: Row[] | Row) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ label: `${column}=${String(value)}`, test: (r) => r[column] === value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ label: `${column} in (${values.join(",")})`, test: (r) => values.includes(r[column]) });
    return this;
  }
  order(column: string) {
    this.orderBy = column;
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }

  then<A = Result, B = never>(ok?: ((r: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, fail);
  }

  private run(): Result {
    const t = this.table;
    t.log.push({ role: this.role, op: this.op, filters: this.filters.map((f) => f.label) });
    if (t.failNext) {
      const error = t.failNext;
      t.failNext = undefined;
      return { data: null, error, status: 500 };
    }
    const visible = (r: Row) => this.role === "secret" || r.status === "published";
    const matches = (r: Row) => visible(r) && this.filters.every((f) => f.test(r));
    if (this.op !== "select" && this.role === "public") {
      return { data: null, error: { code: "42501", message: "permission denied for table puzzles" }, status: 401 };
    }

    switch (this.op) {
      case "select": {
        let found = t.rows.filter(matches);
        if (this.orderBy) {
          const key = this.orderBy;
          found = [...found].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
        }
        if (this.window) found = found.slice(this.window[0], this.window[1] + 1);
        return { data: found.map((r) => ({ ...r })), error: null, status: 200 };
      }
      case "insert": {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...r }));
        const ids = new Set(t.rows.map((r) => r.id));
        for (const r of incoming) {
          if (ids.has(r.id)) {
            return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "puzzles_pkey"' }, status: 409 };
          }
          ids.add(r.id);
        }
        t.rows.push(...incoming); // all-or-nothing, like one INSERT statement
        return { data: incoming, error: null, status: 201 };
      }
      case "update": {
        const hit = t.rows.filter(matches);
        for (const r of hit) Object.assign(r, this.payload);
        return { data: hit.map((r) => ({ ...r })), error: null, status: 200 };
      }
      case "delete": {
        const hit = t.rows.filter(matches);
        t.rows = t.rows.filter((r) => !hit.includes(r));
        return { data: hit.map((r) => ({ ...r })), error: null, status: 200 };
      }
    }
  }
}

/** A client whose `from("puzzles")` runs against `table` with the given key's rights. */
export function fakeSupabase(table: FakeTable, role: Role): Pick<SupabaseClient, "from"> {
  return { from: () => new Query(table, role) } as unknown as Pick<SupabaseClient, "from">;
}
