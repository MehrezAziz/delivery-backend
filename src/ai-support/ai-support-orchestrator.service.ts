import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { SupportTicketPriority } from '@prisma/client';
import { GroqChatMessage, GroqClientService } from './groq-client.service';
import { AiSupportToolsService } from './ai-support-tools.service';
import { AI_SUPPORT_TOOL_DEFINITIONS } from './ai-support.tool-definitions';
import { AI_SUPPORT_BOT_SENDER_ID } from './ai-support.constants';
import {
  needsHumanEscalationNotification,
  sensitiveTopicNeedsTeam,
  userRequestedHuman,
  userSignalsFrustration,
} from './ai-support-handoff';
import {
  buildCitationLines,
  inferTrackRecommendation,
  mergeCitations,
} from './ai-support-citations';
import { AiSupportConfigService } from './ai-support-config.service';
import { AI_SUPPORT_DEFAULT_POLICIES } from './ai-support-default-policies';

const MAX_TOOL_ROUNDS = 6;
const STREAM_CHUNK = 32;
/** Max support messages loaded into the model transcript (older turns dropped with a note). */
const MAX_TRANSCRIPT_MESSAGES = 32;

@Injectable()
export class AiSupportOrchestratorService {
  private readonly logger = new Logger(AiSupportOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groq: GroqClientService,
    private readonly tools: AiSupportToolsService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly aiSupportConfig: AiSupportConfigService,
  ) {}

  /** Use this before scheduling AI work (env + Groq + admin runtime toggle). */
  async canRunAiSupport(): Promise<boolean> {
    return this.aiSupportConfig.isEnabled();
  }

  private systemPrompt(policiesBlock: string): string {
    return [
      'You are the in-app delivery platform support assistant.',
      'Respond in the same language the user writes in when possible (e.g. English, French). Keep a professional, calm tone.',
      '**Always answer the user’s latest message first.** If they only say hello, thanks, or something conversational, reply briefly and warmly; do **not** dump full order status unless they asked about an order, delivery, or shipment.',
      'Use tools when the question needs real data (orders, wallet, profile). Never invent order IDs, amounts, or statuses.',
      'If tools return an error or empty data, say you cannot see it and offer a human agent.',
      'Do not promise refunds, legal outcomes, or account changes; route those to a human.',
      'Be concise. When you mention tool data, say it once in plain language—avoid repeating the same long paragraph as in your previous turn unless the user explicitly asks again about that detail.',
      'If live map tracking applies, mention Track only when relevant; do not repeat the same Track sentence every reply.',
      'If the user asked to speak with a human or raised payment/legal issues, acknowledge briefly; the team is notified when required.',
      '',
      'Policies and product rules (follow strictly):',
      policiesBlock || '- Follow platform Terms of Service; do not share passwords or card numbers.',
    ].join('\n');
  }

  private buildPoliciesBlock(): string {
    const env = (this.config.get<string>('AI_SUPPORT_POLICIES') ?? '').trim();
    const parts = [AI_SUPPORT_DEFAULT_POLICIES];
    if (env) parts.push('Additional policies from configuration:\n' + env);
    return parts.join('\n\n');
  }

  private async emitStreamChunks(
    text: string,
    onStreamChunk?: (chunk: string) => void | Promise<void>,
  ) {
    if (!onStreamChunk || !text) return;
    for (let i = 0; i < text.length; i += STREAM_CHUNK) {
      await onStreamChunk(text.slice(i, i + STREAM_CHUNK));
    }
  }

  /**
   * After a user message is persisted, generate an AI reply when the ticket is still unassigned.
   */
  async handleUserMessage(params: {
    ticketId: string;
    userId: string;
    userMessageContent: string;
    onStreamChunk?: (chunk: string) => void | Promise<void>;
  }): Promise<
    | {
        id: string;
        content: string;
        metadata: Record<string, unknown> | null;
        timestamp: Date;
      }
    | null
  > {
    if (!(await this.canRunAiSupport())) return null;

    const composed = await this.composeBotReply({
      ticketId: params.ticketId,
      userId: params.userId,
      userMessageContent: params.userMessageContent,
      onStreamChunk: params.onStreamChunk,
    });
    if (!composed) return null;

    if (!composed.usedRealTokenStream) {
      await this.emitStreamChunks(composed.finalText, params.onStreamChunk);
    }

    try {
      const saved = await this.prisma.supportMessage.create({
        data: {
          ticketId: params.ticketId,
          senderId: AI_SUPPORT_BOT_SENDER_ID,
          senderType: 'BOT',
          content: composed.finalText,
          metadata: composed.meta as object,
        },
      });

      this.eventEmitter.emit('support.ticket_reply', {
        ticketId: params.ticketId,
        userId: params.userId,
      });

      return {
        id: saved.id,
        content: saved.content,
        metadata: composed.meta,
        timestamp: saved.timestamp,
      };
    } catch (e) {
      this.logger.error(`AI support persist failed: ${(e as Error).message}`, (e as Error).stack);
      throw e;
    }
  }

  private async composeBotReply(params: {
    ticketId: string;
    userId: string;
    userMessageContent: string;
    onStreamChunk?: (chunk: string) => void | Promise<void>;
  }): Promise<{
    finalText: string;
    meta: Record<string, unknown>;
    didEscalateThisTurn: boolean;
    usedRealTokenStream: boolean;
  } | null> {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: params.ticketId },
    });
    if (!ticket || ticket.userId !== params.userId) return null;
    if (ticket.assignedTo) return null;
    if (ticket.status === 'CLOSED') return null;

    const userText = params.userMessageContent?.trim() ?? '';
    const notifyTeam = needsHumanEscalationNotification(userText);
    let escalationReason: 'human_intent' | 'sensitive_topic' | undefined;
    if (userRequestedHuman(userText)) escalationReason = 'human_intent';
    else if (sensitiveTopicNeedsTeam(userText)) escalationReason = 'sensitive_topic';

    const didEscalateThisTurn = notifyTeam && !ticket.humanEscalationNotifiedAt;
    if (didEscalateThisTurn) {
      await this.escalateHumanRequest(ticket.id, ticket.priority);
    }

    const ctx = { ticketId: params.ticketId, userId: params.userId };
    const contextPack = await this.tools.buildInitialContextPack(ctx);

    const priorRaw = await this.prisma.supportMessage.findMany({
      where: { ticketId: params.ticketId },
      orderBy: { timestamp: 'asc' },
      take: 48,
      select: {
        senderType: true,
        content: true,
        image: true,
      },
    });

    const filtered = priorRaw.filter((m) => m.content?.trim() || m.image);
    let droppedCount = 0;
    let prior = filtered;
    if (filtered.length > MAX_TRANSCRIPT_MESSAGES) {
      droppedCount = filtered.length - MAX_TRANSCRIPT_MESSAGES;
      prior = filtered.slice(-MAX_TRANSCRIPT_MESSAGES);
    }

    const transcript: GroqChatMessage[] = [];
    if (droppedCount > 0) {
      transcript.push({
        role: 'user',
        content: `[System: ${droppedCount} older messages were omitted to stay within the context limit. Summarize only from recent context if needed.]`,
      });
    }
    for (const m of prior) {
      const role =
        m.senderType === 'USER' ? 'user' : m.senderType === 'BOT' ? 'assistant' : 'assistant';
      const text =
        m.image && m.content
          ? `${m.content}\n[image attachment]`
          : m.image
            ? '[image attachment]'
            : m.content ?? '';
      transcript.push({ role: role as 'user' | 'assistant', content: text });
    }

    const extraSystem = [
      notifyTeam
        ? 'The user may need a specialist (explicit human request and/or sensitive topic such as refunds or legal matters). Do not promise outcomes; if escalation applies, say the team has been notified.'
        : '',
      userSignalsFrustration(userText)
        ? 'The user sounds frustrated; acknowledge briefly, stay factual, avoid arguing.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const messages: GroqChatMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt(this.buildPoliciesBlock()) + extraSystem,
      },
      {
        role: 'user',
        content: `Session context (may be slightly stale; use tools for accuracy):\n${contextPack}`,
      },
      ...transcript,
    ];

    const model = this.groq.model;
    let round = 0;
    const citationLines: string[] = [];
    const toolResults: Array<{ name: string; result: unknown }> = [];

    const defaultReply =
      "Thanks for your message — a specialist will take over if needed. Is there anything else I can check for you?";

    try {
      while (round < MAX_TOOL_ROUNDS) {
        round++;
        const completion = await this.groq.chatCompletion({
          messages,
          tools: AI_SUPPORT_TOOL_DEFINITIONS,
          toolChoice: 'auto',
          temperature: 0.35,
        });

        const choice = completion.choices[0];
        if (!choice) break;

        const msg = choice.message;

        if (msg.tool_calls?.length) {
          messages.push({
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.tool_calls,
          });
          for (const call of msg.tool_calls) {
            const name = call.function.name;
            const args = call.function.arguments ?? '{}';
            this.logger.log(
              JSON.stringify({
                audit: 'ai_support_tool',
                ticketId: params.ticketId,
                model,
                tool: name,
              }),
            );
            let argsObj: Record<string, unknown> = {};
            try {
              argsObj = JSON.parse(args) as Record<string, unknown>;
            } catch {
              argsObj = {};
            }

            const t0 = Date.now();
            let result: unknown;
            let success = true;
            let errorCode: string | null = null;
            try {
              result = await this.tools.execute(name, ctx, args);
              const err = (result as { error?: string })?.error;
              if (err) {
                success = false;
                errorCode = String(err);
              }
            } catch (e) {
              success = false;
              errorCode = 'EXEC';
              result = { error: 'TOOL_FAILED' };
            }
            await this.prisma.aiSupportToolLog.create({
              data: {
                ticketId: ctx.ticketId,
                userId: ctx.userId,
                toolName: name,
                durationMs: Date.now() - t0,
                success,
                errorCode,
                model,
              },
            });

            toolResults.push({ name, result });
            citationLines.push(...buildCitationLines(name, argsObj, result));
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });
          }
          continue;
        }

        let finalText: string;
        let usedRealTokenStream = false;
        if (params.onStreamChunk) {
          try {
            finalText = await this.groq.streamChatText({
              messages,
              onToken: params.onStreamChunk,
            });
            if (!finalText) {
              finalText = msg.content?.trim() || defaultReply;
            } else {
              usedRealTokenStream = true;
            }
          } catch (streamErr) {
            this.logger.warn(`Groq stream failed, using non-stream content: ${(streamErr as Error).message}`);
            finalText = msg.content?.trim() || defaultReply;
          }
        } else {
          finalText = msg.content?.trim() || defaultReply;
        }

        const citations = mergeCitations(citationLines);
        const trackRecommendation = inferTrackRecommendation(toolResults);

        const meta: Record<string, unknown> = {
          helpfulnessPrompt: true,
          model,
          groq: true,
          citations,
          ...(trackRecommendation ? { trackRecommendation } : {}),
          ...(didEscalateThisTurn && escalationReason ? { escalationReason } : {}),
        };

        return { finalText, meta, didEscalateThisTurn, usedRealTokenStream };
      }

      const fallbackLoop =
        "We're having trouble finishing this reply. Please try again or ask for a human agent.";
      const citations = mergeCitations(citationLines);
      const trackRecommendation = inferTrackRecommendation(toolResults);
      return {
        finalText: fallbackLoop,
        meta: {
          helpfulnessPrompt: true,
          model,
          groq: true,
          citations,
          loopExhausted: true,
          ...(trackRecommendation ? { trackRecommendation } : {}),
          ...(didEscalateThisTurn && escalationReason ? { escalationReason } : {}),
        } as Record<string, unknown>,
        didEscalateThisTurn,
        usedRealTokenStream: false,
      };
    } catch (e) {
      const err = e as Error;
      this.logger.error(`AI support failed: ${err.message}`, err.stack);
      const msg = err.message ?? '';
      const dailyQuota = msg.includes('GROQ_DAILY_QUOTA') || /tokens per day|\bTPD\b/i.test(msg);
      const fallback = dailyQuota
        ? "Our AI assistant has reached its usage limit for today (provider quota). Please try again tomorrow, or tap to speak with a human agent — our team can help you right away."
        : "We're having trouble reaching our assistant right now. Please try again in a moment, or ask for a human agent and our team will help you.";
      return {
        finalText: fallback,
        meta: {
          error: true,
          groqDailyQuota: dailyQuota,
          model: this.groq.model,
          helpfulnessPrompt: false,
        } as Record<string, unknown>,
        didEscalateThisTurn,
        usedRealTokenStream: false,
      };
    }
  }

  private async escalateHumanRequest(ticketId: string, currentPriority: SupportTicketPriority) {
    const nextPriority =
      currentPriority === SupportTicketPriority.URGENT
        ? SupportTicketPriority.URGENT
        : SupportTicketPriority.HIGH;

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        priority: nextPriority,
        humanEscalationNotifiedAt: new Date(),
      },
    });

    const t = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true },
    });
    if (!t) return;

    this.eventEmitter.emit('support.human_requested', {
      ticketId,
      userId: t.userId,
    });
  }
}
