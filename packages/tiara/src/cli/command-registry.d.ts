export interface CLICommand {
  handler: (args: string[], flags: Record<string, string | boolean>) => unknown | Promise<unknown>;
  description?: string;
  usage?: string;
  examples?: string[];
  details?: string;
  hidden?: boolean;
  customHelp?: boolean;
}

export const commandRegistry: Map<string, CLICommand>;

export function registerCoreCommands(): void;
export function registerCommand(name: string, command: CLICommand): void;
export function getCommand(name: string): CLICommand | undefined;
export function listCommands(includeHidden?: boolean): Array<{ name: string } & CLICommand>;
export function hasCommand(name: string): boolean;
export function executeCommand(
  name: string,
  subArgs: string[],
  flags: Record<string, string | boolean>,
): Promise<void>;
export function showCommandHelp(name: string): void;
export function showAllCommands(): void;
