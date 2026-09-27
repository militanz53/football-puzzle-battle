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
  /** Unique keys besides `id` (e.g. lower(username)); a clash fails with 23505, like Postgres. */
  unique?: ((row: Row) => unknown)[];
  /** Column defaults filled in on insert (e.g. an id), like the table's own. */
  defaults?: () => Row;
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
  private descending = false;

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
  neq(column: string, value: unknown) {
    this.filters.push({ label: `${column}!=${String(value)}`, test: (r) => r[column] !== value });
    return this;
  }
  gte(column: string, value: string | number) {
    this.filters.push({ label: `${column}>=${value}`, test: (r) => String(r[column]) >= String(value) });
    return this;
  }
  /** Case-insensitive LIKE: % and _ are wildcards, a backslash escapes them. */
  ilike(column: string, pattern: string) {
    const literal = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let source = "";
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === "\\" && i + 1 < pattern.length) source += literal(pattern[++i]);
      else if (c === "%") source += ".*";
      else if (c === "_") source += ".";
      else source += literal(c);
    }
    const like = new RegExp(`^${source}$`, "is");
    this.filters.push({ label: `${column} ilike ${pattern}`, test: (r) => like.test(String(r[column])) });
    return this;
  }
  /** PostgREST or(): only "column.eq.value" terms, comma-separated. */
  or(expression: string) {
    const terms = expression.split(",").map((t) => t.split(".eq."));
    this.filters.push({ label: `or(${expression})`, test: (r) => terms.some(([c, v]) => String(r[c]) === v) });
    return this;
  }
  limit(n: number) {
    this.window = [0, n - 1];
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ label: `${column} in (${values.join(",")})`, test: (r) => values.includes(r[column]) });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = column;
    this.descending = options?.ascending === false;
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
          found = [...found].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (this.descending ? -1 : 1));
        }
        if (this.window) found = found.slice(this.window[0], this.window[1] + 1);
        return { data: found.map((r) => ({ ...r })), error: null, status: 200 };
      }
      case "insert": {
        const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...t.defaults?.(), ...r }));
        const ids = new Set(t.rows.map((r) => r.id));
        const keys = (t.unique ?? []).map((key) => new Set(t.rows.map(key)));
        for (const r of incoming) {
          if ((r.id !== undefined && ids.has(r.id)) || (t.unique ?? []).some((key, i) => keys[i].has(key(r)))) {
            return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "puzzles_pkey"' }, status: 409 };
          }
          ids.add(r.id);
          (t.unique ?? []).forEach((key, i) => keys[i].add(key(r)));
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

/** A client over several tables by name (secret key rights). */
export function fakeDatabase(tables: Record<string, FakeTable>): Pick<SupabaseClient, "from"> {
  return {
    from: (name: string) => {
      if (!tables[name]) throw new Error(`fakeDatabase has no table "${name}"`);
      return new Query(tables[name], "secret");
    },
  } as unknown as Pick<SupabaseClient, "from">;
}

/** A client whose `from("puzzles")` runs against `table` with the given key's rights. */
export function fakeSupabase(table: FakeTable, role: Role): Pick<SupabaseClient, "from"> {
  return { from: () => new Query(table, role) } as unknown as Pick<SupabaseClient, "from">;
}
