import { EventEmitter } from 'events';
import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';
import type { AgentUpdatePayload } from '../shared/protocol.js';

export interface AgentSpawnOptions {
  systemPrompt: string;
  cwd: string;
  /** Existing Claude session ID to resume (optional) */
  resumeSessionId?: string;
  /** Called when the agent decides it has a meaningful chunk to report */
  onUpdate?: (update: AgentUpdatePayload) => void;
}

/**
 * Thin wrapper around the Claude Agent SDK's query() for a peer's work session.
 *
 * The agent runs in interactive mode — it accepts user turns via `send()` and
 * streams assistant output via the 'assistant-text' event. The optional
 * onUpdate callback fires when the agent emits an "update summary" block we
 * recognize in its output (marker: "::update-summary::" in a code fence).
 *
 * This is a foundation wrapper; richer tool/permission wiring can be added
 * later without changing the shape.
 */
export class PeerAgent extends EventEmitter {
  private sessionId: string | null = null;
  private cwd: string;
  private systemPrompt: string;
  private abortController: AbortController;
  private messageQueue: Array<{ role: 'user'; content: string }> = [];
  private running = false;
  private onUpdate?: (update: AgentUpdatePayload) => void;

  constructor(opts: AgentSpawnOptions) {
    super();
    this.cwd = opts.cwd;
    this.systemPrompt = opts.systemPrompt;
    this.sessionId = opts.resumeSessionId ?? null;
    this.abortController = new AbortController();
    this.onUpdate = opts.onUpdate;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  async send(userText: string, participantId: string): Promise<void> {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      // Graceful degradation: no creds available
      this.emit('assistant-text', '[agent disabled: no ANTHROPIC_API_KEY]');
      return;
    }

    this.running = true;
    try {
      const iter = claudeQuery({
        prompt: userText,
        options: {
          cwd: this.cwd,
          systemPrompt: this.systemPrompt,
          resume: this.sessionId ?? undefined,
          abortController: this.abortController,
        },
      });

      for await (const msg of iter) {
        if (msg.type === 'assistant' && msg.message?.content) {
          const text = extractText(msg.message.content);
          if (text) {
            this.emit('assistant-text', text);
            this.maybeEmitUpdate(text, participantId);
          }
          if (msg.session_id) this.sessionId = msg.session_id;
        } else if (msg.type === 'result') {
          if (msg.session_id) this.sessionId = msg.session_id;
          this.emit('turn-complete');
          break;
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }

  private maybeEmitUpdate(text: string, participantId: string): void {
    const marker = /```update-summary\s*([\s\S]*?)```/;
    const m = marker.exec(text);
    if (!m || !this.onUpdate) return;

    const body = m[1].trim();
    const lines = body.split('\n');
    const summary = lines[0] ?? 'update';

    // Extract bullet list of files mentioned (best-effort)
    const files: string[] = [];
    for (const line of lines) {
      const fmatch = /`([^`]+\.[a-z0-9]+)`/gi.exec(line);
      if (fmatch) files.push(fmatch[1]);
    }

    this.onUpdate({
      participantId,
      summary,
      changes: body,
      crossRoleImplications: null,
      files,
    });
  }

  abort(): void {
    this.abortController.abort();
  }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block: any) => {
        if (typeof block === 'string') return block;
        if (block?.type === 'text' && typeof block.text === 'string') return block.text;
        return '';
      })
      .join('');
  }
  return '';
}
