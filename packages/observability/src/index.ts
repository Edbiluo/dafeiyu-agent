export type TelemetryAttributes = Record<string, string | number | boolean>;

export interface Telemetry {
  recordEvent(name: string, attributes?: TelemetryAttributes): void;
  recordError(name: string, error: unknown, attributes?: TelemetryAttributes): void;
  measure<T>(name: string, operation: () => Promise<T>, attributes?: TelemetryAttributes): Promise<T>;
}

export class ConsoleTelemetry implements Telemetry {
  recordEvent(name: string, attributes: TelemetryAttributes = {}): void {
    console.info(JSON.stringify({ level: 'info', event: name, ...attributes }));
  }

  recordError(
    name: string,
    error: unknown,
    attributes: TelemetryAttributes = {},
  ): void {
    console.error(
      JSON.stringify({
        level: 'error',
        event: name,
        error: error instanceof Error ? error.message : String(error),
        ...attributes,
      }),
    );
  }

  async measure<T>(
    name: string,
    operation: () => Promise<T>,
    attributes: TelemetryAttributes = {},
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      return await operation();
    } finally {
      this.recordEvent(`${name}.duration`, {
        ...attributes,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    }
  }
}
