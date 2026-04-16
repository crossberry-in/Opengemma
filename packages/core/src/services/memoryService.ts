/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, MemoryProvider } from '../config/config.js';
import { DefaultMemoryProvider } from './defaultMemoryProvider.js';
import { debugLogger } from '../utils/debugLogger.js';

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as { then: unknown }).then === 'function'
  );
}

export class MemoryService {
  private activeProvider: MemoryProvider;

  constructor(private config: Config) {
    this.activeProvider = this.resolveActiveProvider();
  }

  private resolveActiveProvider(): MemoryProvider {
    let selected: MemoryProvider | undefined;
    for (const ext of this.config.getExtensions()) {
      if (ext.isActive && ext.memoryProvider) {
        if (!selected) {
          selected = ext.memoryProvider;
        } else {
          debugLogger.warn(
            `[MemoryService] Ignoring memory provider "${ext.memoryProvider.id}" from extension "${ext.name}" — provider "${selected.id}" is already active`,
          );
        }
      }
    }
    return selected ?? new DefaultMemoryProvider();
  }

  getIdleTimeoutMs(): number | undefined {
    if (!this.activeProvider.onIdle) {
      return undefined;
    }
    return this.activeProvider.idleTimeoutMs ?? 5 * 60 * 1000;
  }

  async onSessionStart(sessionId: string): Promise<void> {
    try {
      if (this.activeProvider.onSessionStart) {
        await this.activeProvider.onSessionStart(this.config, sessionId);
      }
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during onSessionStart:`,
        error,
      );
    }
  }

  async getSystemInstructions(): Promise<string> {
    try {
      if (this.activeProvider.getSystemInstructions) {
        return await this.activeProvider.getSystemInstructions();
      }
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during getSystemInstructions:`,
        error,
      );
    }
    return '';
  }

  async getTurnContext(query: string): Promise<string> {
    try {
      if (this.activeProvider.getTurnContext) {
        return await this.activeProvider.getTurnContext(query);
      }
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during getTurnContext:`,
        error,
      );
    }
    return '';
  }

  onTurnComplete(userMessage: string, assistantMessage: string): void {
    const hook = this.activeProvider.onTurnComplete;
    if (!hook) {
      return;
    }
    let result: unknown;
    try {
      result = hook.call(this.activeProvider, userMessage, assistantMessage);
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during onTurnComplete:`,
        error,
      );
      return;
    }
    // Legacy providers may still return a Promise. Attach a catch so a
    // rejection doesn't become an unhandled rejection, but do NOT await —
    // a slow provider must not delay the next turn.
    if (isPromiseLike(result)) {
      result.then(undefined, (error: unknown) =>
        debugLogger.warn(
          `[MemoryService] Provider "${this.activeProvider.id}" rejected during onTurnComplete:`,
          error,
        ),
      );
    }
  }

  async onIdle(): Promise<void> {
    try {
      if (this.activeProvider.onIdle) {
        await this.activeProvider.onIdle();
      }
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during onIdle:`,
        error,
      );
    }
  }

  async onSessionEnd(): Promise<void> {
    try {
      if (this.activeProvider.onSessionEnd) {
        await this.activeProvider.onSessionEnd();
      }
    } catch (error) {
      debugLogger.warn(
        `[MemoryService] Provider "${this.activeProvider.id}" threw during onSessionEnd:`,
        error,
      );
    }
  }
}
