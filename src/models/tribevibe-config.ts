export interface TribeVibeConfig {
  version: 1;
  project: {
    slug: string;
    localPath: string;
    claudeMemoryPath: string;
  };
  sharedRepo: {
    url: string;
    localClonePath: string;
    branch: string;
    lastSynced: string | null;
  };
  identity: {
    username: string;
    machineId: string;
    handle: string; // "username@machineId"
  };
}

export interface TribeVibeState {
  // content hash → last-pushed ISO timestamp
  pushedHashes: Record<string, string>;
  // filename → content hash (for change detection)
  fileHashes: Record<string, string>;
  activeSessionId: string | null;
}
