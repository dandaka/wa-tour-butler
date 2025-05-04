declare module 'better-sqlite3' {
  interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): IterableIterator<any>;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): this;
    transaction(fn: (...args: any[]) => void): (...args: any[]) => void;
    pragma(pragma: string, options?: { simple?: boolean }): any;
    checkpoint(databaseName?: string): this;
    function(name: string, fn: (...args: any[]) => any): this;
    aggregate(name: string, options: { start?: any; step: (...args: any[]) => void; result?: () => any; inverse?: (...args: any[]) => void; deterministic?: boolean }): this;
    backup(filename: string): Promise<void>;
    backup(filename: string, callback: (err: Error | null) => void): this;
    close(): this;
    serialize(options?: { attached?: boolean }): Buffer;
    readonly name: string;
    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly readonly: boolean;
    readonly memory: boolean;
  }

  interface DatabaseConstructor {
    new(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number; verbose?: (...args: any[]) => void }): Database;
    (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean; timeout?: number; verbose?: (...args: any[]) => void }): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
