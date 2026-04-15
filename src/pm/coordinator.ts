import { EventEmitter } from 'events';
import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk';
import { StatusTracker } from './status-tracker.js';
import { MeetingManager } from './meeting.js';
import { DebouncedPM } from './debounce.js';
import { pmSystemPrompt } from '../agent/system-prompt.js';
import type { SessionPhase } from '../shared/protocol.js';

export interface PMAction {
  kind: 'chat' | 'proposal' | 'broadcast' | 'targeted' | 'recommend-meeting' | 'silent';
  text?: string;
  title?: string;
  body?: string;
  targetName?: string;
  kind_sub?: 'roles' | 'scaffold' | 'decision' | 'general';
  reason?: string;
  relevantNames?: string[];
}

export interface PMCoordinatorInit {
  projectName: string;
  brownfield: boolean;
  cwd: string; // host's working repo
  participants: Array<{ id: string; name: string; role: string | null; scope: string[] }>;
  scaffoldSummary: string;
}

export interface PMContextMessage {
  fromName: string;
  text: string;
  /** Optional metadata for context (e.g., "agent-update from Alice") */
  kind?: string;
}

/**
 * The PM agent. Wraps a Claude Agent SDK session with an evolving system
 * prompt, a debounced response evaluator, and a status tracker.
 */
export class PMCoordinator extends EventEmitter {
  readonly status = new StatusTracker();
  readonly meetings = new MeetingManager();
  private phase: SessionPhase = 'lobby';
  private pending: PMContextMessage[] = [];
  private debouncer: DebouncedPM;
  private abortController = new AbortController();
  private sessionId: string | null = null;

  private projectName: string;
  private brownfield: boolean;
  private cwd: string;
  private participants: PMCoordinatorInit['participants'];
  private scaffoldSummary: string;

  constructor(init: PMCoordinatorInit) {
    super();
    this.projectName = init.projectName;
    this.brownfield = init.brownfield;
    this.cwd = init.cwd;
    this.participants = init.participants;
    this.scaffoldSummary = init.scaffoldSummary;

    this.debouncer = new DebouncedPM(() => this.evaluateAndRespond('debounce'));
  }

  setPhase(phase: SessionPhase): void {
    this.phase = phase;
  }

  updateParticipants(participants: PMCoordinatorInit['participants']): void {
    this.participants = participants;
  }

  updateScaffold(summary: string): void {
    this.scaffoldSummary = summary;
  }

  /** Push an external event into the PM's context. Decides async whether to respond. */
  observe(msg: PMContextMessage, urgency: 'hard' | 'soft' = 'soft'): void {
    this.pending.push(msg);
    if (urgency === 'hard') {
      this.debouncer.cancel();
      this.evaluateAndRespond('hard');
    } else {
      this.debouncer.tickle();
    }
  }

  private buildSystemPrompt(): string {
    return pmSystemPrompt({
      projectName: this.projectName,
      brownfield: this.brownfield,
      participants: this.participants.map((p) => ({
        name: p.name,
        role: p.role,
        scope: p.scope,
      })),
      scaffoldSummary: this.scaffoldSummary,
      masterStatus: this.status.toMarkdown(),
    });
  }

  private buildUserPrompt(trigger: 'hard' | 'debounce' | 'explicit', explicitAsk?: string): string {
    const ctx = this.pending
      .map((m) => `- [${m.kind ?? 'chat'}] ${m.fromName}: ${m.text}`)
      .join('\n');
    this.pending = [];

    const base = `Current session phase: ${this.phase}

Recent context:
${ctx || '(no new events)'}
`;
    if (trigger === 'explicit' && explicitAsk) {
      return base + '\n' + explicitAsk;
    }
    return base + `\nEvaluate: do you need to act? Respond with the JSON actions block. If nothing is needed, use "silent".`;
  }

  private async evaluateAndRespond(trigger: 'hard' | 'debounce' | 'explicit', explicitAsk?: string): Promise<void> {
    // No preflight auth check — the SDK uses Claude Code's own auth chain,
    // so if the user is logged into Claude Code this Just Works. If auth
    // really fails, the SDK raises and we emit 'error'.
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(trigger, explicitAsk);

    let fullText = '';
    try {
      const iter = claudeQuery({
        prompt: userPrompt,
        options: {
          cwd: this.cwd,
          systemPrompt,
          resume: this.sessionId ?? undefined,
          abortController: this.abortController,
        },
      });
      for await (const msg of iter) {
        if (msg.type === 'assistant' && msg.message?.content) {
          fullText += extractText(msg.message.content);
          if (msg.session_id) this.sessionId = msg.session_id;
        } else if (msg.type === 'result') {
          if (msg.session_id) this.sessionId = msg.session_id;
          break;
        }
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err));
      return;
    }

    const actions = parseActions(fullText);
    for (const a of actions) {
      this.emit('action', a);
    }
  }

  /**
   * Ask the PM to explicitly produce a proposal (used at the start of planning
   * phase and for scaffold generation).
   */
  async requestProposal(ask: string): Promise<void> {
    await this.evaluateAndRespond('explicit', ask);
  }

  abort(): void {
    this.abortController.abort();
    this.debouncer.cancel();
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

function parseActions(text: string): PMAction[] {
  // Look for a ```json {... "actions": [...] } ``` block
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const payload = fenceMatch ? fenceMatch[1] : text;
  try {
    const parsed = JSON.parse(payload) as { actions?: PMAction[] };
    if (Array.isArray(parsed.actions)) return parsed.actions;
  } catch {
    // fallback: treat entire text as a chat message
    if (text.trim().length > 0) {
      return [{ kind: 'chat', text: text.trim() }];
    }
  }
  return [{ kind: 'silent' }];
}
