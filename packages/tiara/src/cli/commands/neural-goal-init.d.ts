export interface InitModuleOptions {
  force?: boolean;
  target?: string;
  targetDir?: string;
}

export function registerNeuralGoalCommands(program: unknown): Promise<void> | void;
export function initNeuralModule(options: InitModuleOptions): Promise<void>;
export function initGoalModule(options: InitModuleOptions): Promise<void>;
