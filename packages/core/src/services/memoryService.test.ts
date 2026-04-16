/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryService } from './memoryService.js';
import type {
  Config,
  GeminiCLIExtension,
  MemoryProvider,
} from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./defaultMemoryProvider.js', () => ({
  DefaultMemoryProvider: class {
    readonly id = 'default';
  },
}));

function createMockProvider(
  overrides: Partial<MemoryProvider> = {},
): MemoryProvider {
  return {
    id: 'test-provider',
    ...overrides,
  };
}

function createMockConfig(
  extensions: Array<Partial<GeminiCLIExtension>> = [],
): Config {
  return {
    getExtensions: () =>
      extensions.map((ext) => ({
        name: ext.name ?? 'test-ext',
        version: '1.0.0',
        isActive: ext.isActive ?? true,
        path: '/tmp',
        contextFiles: [],
        id: ext.id ?? 'test-ext',
        memoryProvider: ext.memoryProvider,
        ...ext,
      })) as GeminiCLIExtension[],
  } as unknown as Config;
}

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveActiveProvider', () => {
    it('falls back to DefaultMemoryProvider when no extension provides one', () => {
      const config = createMockConfig([]);
      const service = new MemoryService(config);
      // DefaultMemoryProvider is mocked with id: 'default'
      expect(service.getIdleTimeoutMs()).toBeUndefined();
    });

    it('uses the extension provider when one is active', async () => {
      const provider = createMockProvider({
        getSystemInstructions: () => 'custom instructions',
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      const instructions = await service.getSystemInstructions();
      expect(instructions).toBe('custom instructions');
    });

    it('skips inactive extensions', async () => {
      const provider = createMockProvider({
        getSystemInstructions: () => 'should not appear',
      });
      const config = createMockConfig([
        { isActive: false, memoryProvider: provider },
      ]);
      const service = new MemoryService(config);

      const instructions = await service.getSystemInstructions();
      expect(instructions).toBe('');
    });

    it('picks the first active provider and warns about duplicates', async () => {
      const provider1 = createMockProvider({
        id: 'provider-1',
        getSystemInstructions: () => 'first',
      });
      const provider2 = createMockProvider({
        id: 'provider-2',
        getSystemInstructions: () => 'second',
      });
      const config = createMockConfig([
        { name: 'ext-a', memoryProvider: provider1 },
        { name: 'ext-b', memoryProvider: provider2 },
      ]);
      const service = new MemoryService(config);

      const instructions = await service.getSystemInstructions();
      expect(instructions).toBe('first');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring memory provider "provider-2"'),
      );
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('provider "provider-1" is already active'),
      );
    });
  });

  describe('getIdleTimeoutMs', () => {
    it('returns undefined when provider has no onIdle', () => {
      const provider = createMockProvider();
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(service.getIdleTimeoutMs()).toBeUndefined();
    });

    it('returns the provider idleTimeoutMs when set', () => {
      const provider = createMockProvider({
        idleTimeoutMs: 10000,
        onIdle: vi.fn(),
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(service.getIdleTimeoutMs()).toBe(10000);
    });

    it('defaults to 5 minutes when provider has onIdle but no timeout', () => {
      const provider = createMockProvider({
        onIdle: vi.fn(),
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(service.getIdleTimeoutMs()).toBe(300000);
    });
  });

  describe('lifecycle delegation', () => {
    it('delegates onSessionStart to the active provider', async () => {
      const onSessionStart = vi.fn();
      const provider = createMockProvider({ onSessionStart });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await service.onSessionStart('session-123');
      expect(onSessionStart).toHaveBeenCalledWith(config, 'session-123');
    });

    it('delegates getTurnContext to the active provider', async () => {
      const provider = createMockProvider({
        getTurnContext: vi.fn().mockResolvedValue('relevant context'),
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      const ctx = await service.getTurnContext('how do I deploy?');
      expect(ctx).toBe('relevant context');
      expect(provider.getTurnContext).toHaveBeenCalledWith('how do I deploy?');
    });

    it('delegates onTurnComplete to the active provider', () => {
      const onTurnComplete = vi.fn();
      const provider = createMockProvider({ onTurnComplete });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      service.onTurnComplete('user msg', 'assistant msg');
      expect(onTurnComplete).toHaveBeenCalledWith('user msg', 'assistant msg');
    });

    it('delegates onIdle to the active provider', async () => {
      const onIdle = vi.fn();
      const provider = createMockProvider({ onIdle });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await service.onIdle();
      expect(onIdle).toHaveBeenCalled();
    });

    it('delegates onSessionEnd to the active provider', async () => {
      const onSessionEnd = vi.fn();
      const provider = createMockProvider({ onSessionEnd });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await service.onSessionEnd();
      expect(onSessionEnd).toHaveBeenCalled();
    });

    it('returns empty string when provider has no getSystemInstructions', async () => {
      const provider = createMockProvider();
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(await service.getSystemInstructions()).toBe('');
    });

    it('returns empty string when provider has no getTurnContext', async () => {
      const provider = createMockProvider();
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(await service.getTurnContext('query')).toBe('');
    });
  });

  describe('error isolation', () => {
    it('catches and logs onSessionStart errors', async () => {
      const provider = createMockProvider({
        onSessionStart: () => {
          throw new Error('startup boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await expect(service.onSessionStart('s1')).resolves.toBeUndefined();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onSessionStart'),
        expect.any(Error),
      );
    });

    it('catches and logs getSystemInstructions errors, returns empty string', async () => {
      const provider = createMockProvider({
        getSystemInstructions: () => {
          throw new Error('instructions boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      const result = await service.getSystemInstructions();
      expect(result).toBe('');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during getSystemInstructions'),
        expect.any(Error),
      );
    });

    it('catches and logs getTurnContext errors, returns empty string', async () => {
      const provider = createMockProvider({
        getTurnContext: () => {
          throw new Error('context boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      const result = await service.getTurnContext('query');
      expect(result).toBe('');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during getTurnContext'),
        expect.any(Error),
      );
    });

    it('catches and logs synchronous onTurnComplete errors', () => {
      const provider = createMockProvider({
        onTurnComplete: () => {
          throw new Error('turn boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      expect(() => service.onTurnComplete('u', 'a')).not.toThrow();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onTurnComplete'),
        expect.any(Error),
      );
    });

    it('logs but does not await rejected promises from legacy onTurnComplete', async () => {
      let rejectFn!: (err: Error) => void;
      const pendingPromise = new Promise<void>((_, reject) => {
        rejectFn = reject;
      });
      // Cast intentionally: legacy providers may still return a Promise even
      // though the interface declares void.
      const onTurnComplete = vi
        .fn()
        .mockReturnValue(
          pendingPromise,
        ) as unknown as MemoryProvider['onTurnComplete'];
      const provider = createMockProvider({ onTurnComplete });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      // Returns synchronously even though the provider hasn't settled.
      service.onTurnComplete('u', 'a');
      expect(debugLogger.warn).not.toHaveBeenCalled();

      rejectFn(new Error('async boom'));
      // Yield once so the .then(undefined, ...) handler runs.
      await Promise.resolve();
      await Promise.resolve();

      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('rejected during onTurnComplete'),
        expect.any(Error),
      );
    });

    it('catches and logs onIdle errors', async () => {
      const provider = createMockProvider({
        onIdle: () => {
          throw new Error('idle boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await expect(service.onIdle()).resolves.toBeUndefined();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onIdle'),
        expect.any(Error),
      );
    });

    it('catches and logs onSessionEnd errors', async () => {
      const provider = createMockProvider({
        onSessionEnd: () => {
          throw new Error('end boom');
        },
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      await expect(service.onSessionEnd()).resolves.toBeUndefined();
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during onSessionEnd'),
        expect.any(Error),
      );
    });

    it('isolates async rejection in provider hooks', async () => {
      const provider = createMockProvider({
        getTurnContext: () => Promise.reject(new Error('async boom')),
      });
      const config = createMockConfig([{ memoryProvider: provider }]);
      const service = new MemoryService(config);

      const result = await service.getTurnContext('query');
      expect(result).toBe('');
      expect(debugLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('threw during getTurnContext'),
        expect.any(Error),
      );
    });
  });
});
