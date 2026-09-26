// OpenCode runs on Bun, so `bun:sqlite` is available at runtime without adding
// a dependency or shelling out to the `sqlite3` binary. It is absent from the
// plugin's `types` (which is `["node"]`), so it is declared here for the same
// reason `@opentui/solid` is: the host provides it, and vendoring a copy would
// only let it drift from the runtime that actually has it.

declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean });
    query(sql: string): {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
    };
    close(): void;
  }
}
