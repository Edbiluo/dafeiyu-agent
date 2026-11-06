import postgres, { type ISql, type Sql } from 'postgres';

export type Database = Sql;
export type QueryableDatabase = ISql;

export function createDatabase(connectionString: string): Database {
  return postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
  });
}
