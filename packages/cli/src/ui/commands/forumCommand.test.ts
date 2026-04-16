/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forumCommand } from './forumCommand.js';
import type { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { loadForumPresets } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadForumPresets: vi.fn(),
  };
});

describe('forumCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {},
        },
      },
    } as unknown as CommandContext);

    vi.mocked(loadForumPresets).mockResolvedValue([]);
  });

  it('starts forum mode with main conversation context by default', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    await startCommand.action(mockContext, 'design-forum');

    expect(mockContext.ui.startForumMode).toHaveBeenCalledWith('design-forum', {
      includeMainConversationContext: true,
    });
  });

  it('starts forum mode in incognito mode when requested', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    await startCommand.action(mockContext, '--incognito design-forum');

    expect(mockContext.ui.startForumMode).toHaveBeenCalledWith('design-forum', {
      includeMainConversationContext: false,
    });
  });

  it('returns an error for unknown options', async () => {
    const startCommand = forumCommand.subCommands?.find(
      (command) => command.name === 'start',
    );
    if (!startCommand?.action) {
      throw new Error('Missing /forum start action.');
    }

    const result = await startCommand.action(
      mockContext,
      '--unknown design-forum',
    );

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Unknown option: --unknown\nUsage: /forum start [--incognito] <preset-name>',
    });
  });
});
