import ngrok from '@ngrok/ngrok';
import localtunnel from 'localtunnel';

export type TunnelProvider = 'ngrok' | 'localtunnel' | 'auto';

export interface TunnelHandle {
  url: string;
  provider: 'ngrok' | 'localtunnel';
  close: () => Promise<void>;
}

/**
 * Start a public tunnel to a local port.
 *
 * Providers:
 *   - "ngrok":       Requires NGROK_AUTHTOKEN (or ~/.config/ngrok/ngrok.yml).
 *                    Reliable; free tier limits one tunnel per session.
 *   - "localtunnel": No signup. Uses loca.lt. Warns visitors with a password
 *                    banner on first HTTP GET, but our WS traffic is encrypted
 *                    anyway so the warning doesn't matter for us.
 *   - "auto":        Use ngrok if NGROK_AUTHTOKEN is set, else localtunnel.
 */
export async function startTunnel(
  localPort: number,
  provider: TunnelProvider = 'auto'
): Promise<TunnelHandle> {
  const chosen = provider === 'auto'
    ? (process.env.NGROK_AUTHTOKEN ? 'ngrok' : 'localtunnel')
    : provider;

  if (chosen === 'ngrok') {
    return startNgrok(localPort);
  }
  return startLocaltunnel(localPort);
}

async function startNgrok(localPort: number): Promise<TunnelHandle> {
  const authtoken = process.env.NGROK_AUTHTOKEN;
  const listener = await ngrok.forward({
    addr: localPort,
    authtoken: authtoken ?? undefined,
  });
  const url = listener.url();
  if (!url) throw new Error('ngrok tunnel started but returned no URL');
  return {
    url,
    provider: 'ngrok',
    close: async () => { await listener.close(); },
  };
}

async function startLocaltunnel(localPort: number): Promise<TunnelHandle> {
  const tunnel = await localtunnel({ port: localPort });
  return {
    url: tunnel.url,
    provider: 'localtunnel',
    close: async () => {
      // localtunnel.close() sometimes never resolves — cap it at 2s
      try { tunnel.close(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}
