/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import {
  loadForumPresets,
  type ForumPreset,
  type ForumSessionOptions,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

function parseStartArgs(args: string): {
  presetName?: string;
  options: ForumSessionOptions;
  error?: string;
} {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const presetParts: string[] = [];
  let includeMainConversationContext = true;

  for (const token of tokens) {
    if (token === '--incognito') {
      includeMainConversationContext = false;
      continue;
    }
    if (token.startsWith('--')) {
      return {
        options: { includeMainConversationContext },
        error: `Unknown option: ${token}`,
      };
    }
    presetParts.push(token);
  }

  return {
    presetName: presetParts.join(' ').trim() || undefined,
    options: { includeMainConversationContext },
  };
}

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List available forum presets',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const config = context.services.agentContext?.config;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Config not loaded.',
      };
    }

    const presets = await loadForumPresets(config);
    if (presets.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content:
          'No forum presets found in ~/.gemini/forums or .gemini/forums.',
      };
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: presets
        .map((preset: ForumPreset) => {
          const members = preset.members
            .map(
              (member: ForumPreset['members'][number]) =>
                member.label ?? member.memberId,
            )
            .join(', ');
          return `${preset.name}: ${members}`;
        })
        .join('\n'),
    });
    return;
  },
};

const startCommand: SlashCommand = {
  name: 'start',
  description: 'Enter forum mode with a preset',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context, args) => {
    const { presetName, options, error } = parseStartArgs(args);
    if (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `${error}\nUsage: /forum start [--incognito] <preset-name>`,
      };
    }
    if (!presetName) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /forum start [--incognito] <preset-name>',
      };
    }

    await context.ui.startForumMode(presetName, options);
    return;
  },
};

const stopCommand: SlashCommand = {
  name: 'stop',
  description: 'Leave forum mode',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => {
    const session = context.ui.getForumSession();
    if (!session) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Forum mode is not active.',
      };
    }

    await context.ui.stopForumMode('Forum stopped.');
    return;
  },
};

export const forumCommand: SlashCommand = {
  name: 'forum',
  description: 'Start or stop a multi-agent forum discussion',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  isSafeConcurrent: true,
  subCommands: [listCommand, startCommand, stopCommand],
};
