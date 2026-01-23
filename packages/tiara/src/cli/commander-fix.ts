// Temporary workaround for TypeScript compiler bug with Commander overloads
import { Command as CommandConstructor } from 'commander';
import type { Command as CommandType } from 'commander';

// Export the Command class directly to avoid overload issues
export type Command = CommandType;
export const Command = CommandConstructor;
export default CommandConstructor;
