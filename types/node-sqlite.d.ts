declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(source: string): void;
    prepare(source: string): StatementSync;
    close(): void;
  }

  export const constants: Record<string, number>;
}
