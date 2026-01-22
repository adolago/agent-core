/**
 * CLI verbosity tests
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  setVerbosity as setUtilsVerbosity,
  printInfo,
  printWarning,
  printDebug,
} from '../../../src/cli/utils.js';
import {
  setVerbosity as setCoreVerbosity,
  info,
  warning,
  debug,
} from '../../../src/cli/cli-core.js';

describe('CLI verbosity', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    setUtilsVerbosity('normal');
    setCoreVerbosity('normal');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('suppresses utils info and warning in quiet mode', () => {
    setUtilsVerbosity('quiet');

    printInfo('info message');
    printWarning('warn message');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits utils debug in verbose mode', () => {
    setUtilsVerbosity('verbose');

    printDebug('debug message');

    expect(logSpy).toHaveBeenCalled();
  });

  it('suppresses cli-core info and warning in quiet mode', () => {
    setCoreVerbosity('quiet');

    info('info message');
    warning('warn message');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits cli-core debug in verbose mode', () => {
    setCoreVerbosity('verbose');

    debug('debug message');

    expect(logSpy).toHaveBeenCalled();
  });
});
