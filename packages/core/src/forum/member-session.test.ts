/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatForumThoughtActivity } from './member-session.js';

describe('formatForumThoughtActivity', () => {
  it('combines the thought subject and description for live activity updates', () => {
    expect(
      formatForumThoughtActivity(
        '**Investigating loops** Tracing recursive retry paths in the scheduler.',
      ),
    ).toBe(
      'Investigating loops: Tracing recursive retry paths in the scheduler.',
    );
  });

  it('falls back to plain text thoughts when no bold subject is present', () => {
    expect(
      formatForumThoughtActivity(
        'Checking whether the same tool call can be re-enqueued twice.',
      ),
    ).toBe('Checking whether the same tool call can be re-enqueued twice.');
  });
});
