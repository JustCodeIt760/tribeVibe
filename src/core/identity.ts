import os from 'os';

export function getIdentity(): { username: string; machineId: string; handle: string } {
  const username = os.userInfo().username;
  const machineId = os.hostname().replace(/[^a-zA-Z0-9-]/g, '-');
  const handle = `${username}@${machineId}`;
  return { username, machineId, handle };
}
