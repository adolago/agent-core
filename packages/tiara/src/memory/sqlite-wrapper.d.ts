export function isSQLiteAvailable(): Promise<boolean>;
export function getSQLiteDatabase(): Promise<unknown>;
export function getLoadError(): unknown;
export function createDatabase(dbPath: string): Promise<unknown>;
export function isWindows(): boolean;
export function getStorageRecommendations(): string[];

declare const _default: {
  isSQLiteAvailable: typeof isSQLiteAvailable;
  getSQLiteDatabase: typeof getSQLiteDatabase;
  getLoadError: typeof getLoadError;
  createDatabase: typeof createDatabase;
  isWindows: typeof isWindows;
  getStorageRecommendations: typeof getStorageRecommendations;
};

export default _default;
