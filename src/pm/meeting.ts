import crypto from 'crypto';
import type { MeetingItem } from '../shared/protocol.js';

export interface ActiveMeeting {
  id: string;
  reason: string;
  items: MeetingItem[];
  currentItemIndex: number;
  decisions: Array<{ itemId: string; decision: string; reasoning: string }>;
  startedAt: number;
}

/**
 * Lightweight meeting state machine. The PM populates items, we advance
 * through them one at a time, and record decisions.
 */
export class MeetingManager {
  private active: ActiveMeeting | null = null;

  start(reason: string, items: MeetingItem[]): ActiveMeeting {
    this.active = {
      id: crypto.randomUUID(),
      reason,
      items,
      currentItemIndex: 0,
      decisions: [],
      startedAt: Date.now(),
    };
    return this.active;
  }

  get current(): ActiveMeeting | null {
    return this.active;
  }

  currentItem(): MeetingItem | null {
    if (!this.active) return null;
    return this.active.items[this.active.currentItemIndex] ?? null;
  }

  recordDecision(itemId: string, decision: string, reasoning: string): void {
    if (!this.active) return;
    this.active.decisions.push({ itemId, decision, reasoning });
  }

  advance(): MeetingItem | null {
    if (!this.active) return null;
    this.active.currentItemIndex += 1;
    return this.currentItem();
  }

  end(): ActiveMeeting | null {
    const m = this.active;
    this.active = null;
    return m;
  }

  summarize(): string {
    if (!this.active) return '';
    const lines: string[] = [`Meeting: ${this.active.reason}`];
    for (const d of this.active.decisions) {
      const item = this.active.items.find((i) => i.id === d.itemId);
      lines.push(`- ${item?.title ?? d.itemId}: ${d.decision} — ${d.reasoning}`);
    }
    return lines.join('\n');
  }
}
