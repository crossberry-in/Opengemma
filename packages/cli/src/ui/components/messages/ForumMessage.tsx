/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { theme } from '../../semantic-colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';

interface ForumMessageProps {
  label: string;
  text: string;
  terminalWidth: number;
  color?: string;
}

export const ForumMessage: React.FC<ForumMessageProps> = ({
  label,
  text,
  terminalWidth,
  color,
}) => {
  const { renderMarkdown } = useUIState();
  const prefix = `[${label}] `;
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row">
      <Box width={prefixWidth}>
        <Text color={color ?? theme.text.accent}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <MarkdownDisplay
          text={text}
          isPending={false}
          terminalWidth={Math.max(terminalWidth - prefixWidth, 0)}
          renderMarkdown={renderMarkdown}
        />
      </Box>
    </Box>
  );
};
