export type VerbosityLevel = 'quiet' | 'normal' | 'verbose';

export function setVerbosity(level: VerbosityLevel): void;
export function printSuccess(message: string): void;
export function printError(message: string): void;
export function printWarning(message: string): void;
export function printInfo(message: string): void;
export function printDebug(message: string): void;
export function exit(code?: number): void;
export function validateArgs(args: string[], minLength: number, usage: string): boolean;
export function ensureDirectory(path: string): Promise<boolean>;
export function fileExists(path: string): Promise<boolean>;
export function readJsonFile<T = Record<string, unknown>>(
  path: string,
  defaultValue?: T,
): Promise<T>;
export function writeJsonFile(path: string, data: unknown): Promise<void>;
export function formatTimestamp(timestamp: number | string | Date): string;
export function truncateString(str: string, length?: number): string;
export function formatBytes(bytes: number): string;
export function parseFlags(
  args: string[],
): { flags: Record<string, string | boolean>; args: string[] };
export function runCommand(
  command: string,
  args?: string[],
  options?: Record<string, unknown>,
): Promise<{ success: boolean; code: number; stdout: string; stderr: string }>;
export function loadConfig(path?: string): Promise<Record<string, unknown>>;
export function saveConfig(config: Record<string, unknown>, path?: string): Promise<void>;
export function generateId(prefix?: string): string;
export function chunk<T>(array: T[], size: number): T[][];
export function getEnvVar(name: string, defaultValue?: string | null): string | null;
export function setEnvVar(name: string, value: string): void;
export function isValidJson(str: string): boolean;
export function isValidUrl(str: string): boolean;
export function showProgress(current: number, total: number, message?: string): void;
export function clearLine(): void;
export function sleep(ms: number): Promise<void>;
export function retry<T>(fn: () => Promise<T>, maxAttempts?: number, delay?: number): Promise<T>;
export function callRuvSwarmMCP(
  tool: string,
  params?: Record<string, unknown>,
): Promise<{ success: boolean; result?: unknown; error?: string }>;
