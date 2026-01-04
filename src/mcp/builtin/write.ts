/**
 * Write Tool
 *
 * Write content to a file on the filesystem.
 * Creates parent directories if they don't exist.
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { defineTool } from '../registry';
import type { ToolExecutionContext } from '../types';

// ============================================================================
// Tool Definition
// ============================================================================

export const WriteTool = defineTool(
  'write',
  'builtin',
  {
    description: `Write content to a file on the filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path
- The file_path parameter must be an absolute path
- Parent directories will be created if they don't exist
- ALWAYS prefer editing existing files to creating new ones
- NEVER proactively create documentation files unless explicitly requested`,

    parameters: z.object({
      content: z.string().describe('The content to write to the file'),
      filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
    }),

    async execute(params, _ctx: ToolExecutionContext) {
      const filepath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(process.cwd(), params.filePath);

      const exists = fs.existsSync(filepath);
      const title = path.basename(filepath);

      // Create parent directories if needed
      const parentDir = path.dirname(filepath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Write the file
      fs.writeFileSync(filepath, params.content);

      return {
        title,
        metadata: {
          filepath,
          exists,
        },
        output: exists ? `File updated: ${filepath}` : `File created: ${filepath}`,
      };
    },
  }
);
