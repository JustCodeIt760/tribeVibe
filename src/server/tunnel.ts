import ngrok from '@ngrok/ngrok';

export interface TunnelHandle {
  url: string;
  close: () => Promise<void>;
}

/**
 * Start an ngrok tunnel to expose the local WebSocket server.
 *
 * Requires NGROK_AUTHTOKEN env var (or ~/.config/ngrok/ngrok.yml). Without
 * an authtoken, ngrok will refuse to start and we return a clear error.
 */
export async function startTunnel(localPort: number): Promise<TunnelHandle> {
  const authtoken = process.env.NGROK_AUTHTOKEN;

  // Let ngrok fall back to its config file if env var is absent.
  const listener = await ngrok.forward({
    addr: localPort,
    authtoken: authtoken ?? undefined,
    // ngrok's free TCP tunnels are limited; we use HTTP which upgrades to WS fine.
  });

  const url = listener.url();
  if (!url) throw new Error('ngrok tunnel started but returned no URL');

  return {
    url,
    close: async () => {
      await listener.close();
    },
  };
}
