/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type { HistoryItemWithoutId } from '../types.js';
import {
  type Config,
  ForumSessionController,
  loadForumPresetByName,
  type ForumSessionOptions,
  type ForumSessionSnapshot,
  type ForumTranscriptEntry,
} from '@google/gemini-cli-core';

function toHistoryItem(entry: ForumTranscriptEntry): HistoryItemWithoutId {
  switch (entry.kind) {
    case 'system':
      return {
        type: 'forum_system',
        label: 'forum',
        text: entry.text,
      };
    case 'user':
      return {
        type: 'forum_user',
        label: entry.isTask ? 'user' : 'user steer',
        text: entry.text,
        isTask: entry.isTask,
      };
    case 'agent':
      return {
        type: 'forum_agent',
        label: entry.label,
        memberId: entry.memberId,
        text: entry.text,
      };
    case 'activity':
      return {
        type: 'forum_activity',
        label: entry.label,
        memberId: entry.memberId,
        activityKind: entry.activityKind,
        text: entry.text,
      };
    case 'final':
      return {
        type: 'forum_final',
        label: `forum final by ${entry.label}`,
        memberId: entry.memberId,
        text: entry.text,
      };
    default:
      throw new Error('Unhandled forum transcript entry.');
  }
}

export function useForumMode(
  config: Config,
  addItem: UseHistoryManagerReturn['addItem'],
) {
  const controllerRef = useRef<ForumSessionController | null>(null);
  const [forumSession, setForumSession] = useState<ForumSessionSnapshot | null>(
    null,
  );
  const [pendingForumHistoryItems, setPendingForumHistoryItems] = useState<
    HistoryItemWithoutId[]
  >([]);

  const handleTranscriptEntry = useCallback(
    (entry: ForumTranscriptEntry) => {
      if (entry.kind === 'system' && /^Round \d+ started\.$/.test(entry.text)) {
        setPendingForumHistoryItems([]);
      }

      if (entry.kind === 'system' && / failed: /.test(entry.text)) {
        const failedLabel = entry.text.split(' failed: ')[0]?.trim();
        setPendingForumHistoryItems((prev) =>
          prev.filter(
            (item) =>
              item.type !== 'forum_activity' || item.label !== failedLabel,
          ),
        );
      }

      if (entry.kind === 'activity') {
        setPendingForumHistoryItems((prev) => {
          const nextItem = toHistoryItem(entry);
          const existingIndex = prev.findIndex(
            (item) =>
              item.type === 'forum_activity' &&
              item.memberId === entry.memberId,
          );
          if (existingIndex === -1) {
            return [...prev, nextItem];
          }

          const next = [...prev];
          next[existingIndex] = nextItem;
          return next;
        });
        return;
      }

      if (entry.kind === 'agent' || entry.kind === 'final') {
        setPendingForumHistoryItems((prev) =>
          prev.filter(
            (item) =>
              item.type !== 'forum_activity' ||
              item.memberId !== entry.memberId,
          ),
        );
      }

      addItem(toHistoryItem(entry), entry.timestamp);
    },
    [addItem],
  );

  const stopForumMode = useCallback(async (reason = 'Forum stopped.') => {
    const controller = controllerRef.current;
    controllerRef.current = null;

    if (!controller) {
      setForumSession(null);
      setPendingForumHistoryItems([]);
      return;
    }

    await controller.stop(reason);
    setPendingForumHistoryItems([]);
    setForumSession(null);
  }, []);

  const startForumMode = useCallback(
    async (presetName: string, options?: ForumSessionOptions) => {
      const preset = await loadForumPresetByName(config, presetName);
      if (!preset) {
        throw new Error(`Forum preset "${presetName}" was not found.`);
      }

      await stopForumMode('Forum preset changed.');
      setPendingForumHistoryItems([]);

      const controller = await ForumSessionController.create(
        config,
        preset,
        {
          onSnapshot: setForumSession,
          onTranscriptEntry: handleTranscriptEntry,
        },
        options,
      );
      controllerRef.current = controller;
      setForumSession(controller.getSnapshot());

      const startItem: HistoryItemWithoutId = {
        type: 'forum_system',
        label: 'forum',
        text:
          options?.includeMainConversationContext === false
            ? `Entered forum mode with preset "${preset.name}" (incognito).`
            : `Entered forum mode with preset "${preset.name}".`,
      };
      addItem(startItem, Date.now());
    },
    [addItem, config, handleTranscriptEntry, stopForumMode],
  );

  const submitForumInput = useCallback(async (value: string) => {
    const controller = controllerRef.current;
    if (!controller) {
      throw new Error('Forum mode is not active.');
    }

    const snapshot = controller.getSnapshot();
    if (
      snapshot.status === 'completed' ||
      snapshot.status === 'stopped' ||
      snapshot.status === 'error'
    ) {
      throw new Error(
        'The current forum session has finished. Start a new preset with /forum start.',
      );
    }
    if (!snapshot.task) {
      await controller.startTask(value);
      return;
    }

    await controller.addUserSteer(value);
  }, []);

  useEffect(
    () => () => {
      void stopForumMode('Forum session closed.');
    },
    [stopForumMode],
  );

  return {
    forumSession,
    pendingForumHistoryItems,
    startForumMode,
    stopForumMode,
    submitForumInput,
  };
}
