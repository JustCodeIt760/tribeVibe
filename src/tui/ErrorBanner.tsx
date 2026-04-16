import React from 'react';
import { Box, Text } from 'ink';

export interface ErrorBannerProps {
  errors: string[];
  maxVisible?: number;
}

/**
 * Persistent red banner at the top of each view showing recent errors.
 * Renders nothing when there are no errors.
 *
 * Errors are last-N so the banner doesn't grow unbounded; older ones
 * scroll out of view.
 */
export function ErrorBanner({ errors, maxVisible = 3 }: ErrorBannerProps): React.ReactElement | null {
  if (errors.length === 0) return null;
  const shown = errors.slice(-maxVisible);
  return (
    <Box borderStyle="round" borderColor="red" paddingX={1} flexDirection="column">
      <Text bold color="red">⚠ Errors ({errors.length}):</Text>
      {shown.map((e, i) => (
        <Text key={i} color="red">· {e}</Text>
      ))}
    </Box>
  );
}
