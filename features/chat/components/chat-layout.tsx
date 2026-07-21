"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, House, Menu, Sparkles, X } from "lucide-react";

import { ChatComposer } from "@/features/chat/components/chat-composer";
import { ConversationList } from "@/features/chat/components/conversation-list";
import { MessageList } from "@/features/chat/components/message-list";
import { AssistantSelectorPanel } from "@/features/chat/components/assistant-selector-panel";
import { DeletedPersonaNotice } from "@/features/chat/components/deleted-persona-notice";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import type { PersonaChatIdentity } from "@/features/persona/types";
import { applyAgentTerminalMessage, confirmOptimisticTurn, createEditRequestTarget } from "@/features/chat/client-state";
import { getComposerDisabledReason } from "@/features/chat/composer-state";
import { CHAT_HOME_NAVIGATION } from "@/features/chat/navigation";
import type { ChatMessageView, ChatStreamEvent, ConversationDetail, ConversationSummary } from "@/features/chat/types";
import { RecoveryStopError, useGenerationRecovery } from "@/features/generation/use-generation-recovery";
import { requestDurableCancellation } from "@/features/generation/cancel-client";
import { useChatVisualViewport } from "@/features/chat/use-chat-visual-viewport";
import type { AgentRunStatusSnapshot, AgentRunTerminalSnapshot, AgentRunView, AgentStreamEvent } from "@/features/agents/client-types";
import { createPendingAgentRunView, mergeAgentRunStatus, mergeAgentRunTerminal, reduceAgentStreamEvent } from "@/features/agents/client-state";
import { readSseEvents } from "@/features/generation/client-sse";
import type { ChatGenerationMode } from "@/features/chat/types";
import type { ChatBootstrapPayload } from "@/features/chat/bootstrap-types";
import { migrateConversationGeneration, readConversationGeneration, updateConversationGeneration } from "@/features/generation/conversation-registry";
import { useChatPopstateSync } from "@/features/chat/use-chat-popstate-sync";

interface ChatLayoutProps {
  conversations: ConversationSummary[];
  conversation: ConversationDetail | null;
  aiConfigured: boolean;
  agentConfigured: boolean;
  maxInputChars: number;
  personas?: PersonaChatIdentity[];
  selectedPersona?: PersonaChatIdentity;
  initialAgentRuns?: AgentRunView[];
  requestedPersonaId?: string;
  bootstrapPersonas?: boolean;
  initialConversationKey: string;
  viewerId: string;
}

export function ChatLayout({ conversations, conversation, aiConfigured, agentConfigured, maxInputChars, personas = [], selectedPersona, initialAgentRuns = [], requestedPersonaId, bootstrapPersonas = true, initialConversationKey, viewerId }: ChatLayoutProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>(conversation?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [clientReady, setClientReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const [conversationItems, setConversationItems] = useState(conversations);
  const [personaItems, setPersonaItems] = useState(personas);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [activePersona, setActivePersona] = useState(selectedPersona);
  const [controller, setController] = useState<AbortController>();
  const [assistantMessageId, setAssistantMessageId] = useState<string>();
  const [agentRunId, setAgentRunId] = useState<string>();
  const [conversationKey, setConversationKey] = useState(initialConversationKey);
  const [agentRuns, setAgentRuns] = useState<AgentRunView[]>(initialAgentRuns);
  const [generationMode, setGenerationMode] = useState<ChatGenerationMode>("CHAT");
  const [generationKind, setGenerationKind] = useState<"CHAT" | "AGENT">();
  const [cancelling, setCancelling] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ChatMessageView>();
  const [editValue, setEditValue] = useState("");
  const [activeConversationId, setActiveConversationId] = useState(conversation?.id);
  const [activeTitle, setActiveTitle] = useState(conversation?.title);
  const activeConversationRef = useRef<{ id?: string; updatedAt?: string }>({ id: conversation?.id });
  const pendingStopEditRef = useRef(false);
  const pendingCancelRef = useRef(false);
  const generationControllerRef = useRef<AbortController | undefined>(undefined);
  const conversationKeyRef = useRef(initialConversationKey);
  const mountedRef = useRef(true);
  useChatVisualViewport(shellRef);
  useChatPopstateSync(activeConversationRef);
  useEffect(() => {
    mountedRef.current = true;
    setClientReady(true);
    return () => {
      mountedRef.current = false;
      generationControllerRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBootstrapLoading(true);
    fetch(`/api/chat/bootstrap${bootstrapPersonas ? "" : "?personas=0"}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chat bootstrap unavailable");
        return response.json() as Promise<ChatBootstrapPayload>;
      })
      .then((payload) => {
        setConversationItems(payload.conversations);
        if (bootstrapPersonas) {
          setPersonaItems(payload.personas);
          if (requestedPersonaId) setActivePersona(payload.personas.find((persona) => persona.id === requestedPersonaId));
        }
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setError("对话历史暂时无法加载，仍可继续当前对话。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBootstrapLoading(false);
      });
    return () => controller.abort();
  }, [bootstrapPersonas, requestedPersonaId]);
  const readChatGeneration = useCallback(() => readConversationGeneration(sessionStorage, viewerId, conversationKey)?.chatMessageId, [conversationKey, viewerId]);
  const writeChatGeneration = useCallback((runId?: string) => {
    updateConversationGeneration(sessionStorage, viewerId, conversationKey, { chatMessageId: runId ?? null });
  }, [conversationKey, viewerId]);
  const readAgentGeneration = useCallback(() => readConversationGeneration(sessionStorage, viewerId, conversationKey)?.agentRunId, [conversationKey, viewerId]);
  const writeAgentGeneration = useCallback((runId?: string) => {
    updateConversationGeneration(sessionStorage, viewerId, conversationKey, { agentRunId: runId ?? null });
  }, [conversationKey, viewerId]);
  const confirmConversationKey = useCallback((conversationId: string) => {
    const previous = conversationKeyRef.current;
    if (previous === conversationId) return;
    migrateConversationGeneration(sessionStorage, viewerId, previous, conversationId);
    conversationKeyRef.current = conversationId;
    setConversationKey(conversationId);
  }, [viewerId]);
  const clearCurrentGeneration = useCallback((kind: "CHAT" | "AGENT") => {
    updateConversationGeneration(sessionStorage, viewerId, conversationKeyRef.current, kind === "CHAT" ? { chatMessageId: null } : { agentRunId: null });
  }, [viewerId]);
  const recover = useCallback((snapshot: { id: string; conversationId: string; status: string; content: string }) => {
    const currentConversationId = activeConversationRef.current.id;
    if (currentConversationId && snapshot.conversationId !== currentConversationId) {
      updateConversationGeneration(sessionStorage, viewerId, snapshot.conversationId, { chatMessageId: snapshot.status === "PENDING" ? snapshot.id : null });
      return;
    }
    const status = snapshot.status.toLowerCase() as ChatMessageView["status"];
    setMessages((current) => current.map((message) => message.id === snapshot.id ? { ...message, content: snapshot.content, status } : message));
    if (snapshot.status === "PENDING") { setGenerating(true); setError("任务正在后台继续生成。"); }
    else { clearCurrentGeneration("CHAT"); setAssistantMessageId(undefined); setGenerating(false); setError(snapshot.status === "ERROR" ? "生成失败，请稍后重试。" : undefined); }
  }, [clearCurrentGeneration, viewerId]);
  useGenerationRecovery({ persistenceKey: `${viewerId}:${conversationKey}:CHAT`, readRunId: readChatGeneration, writeRunId: writeChatGeneration, runId: assistantMessageId, onRunId: setAssistantMessageId, statusUrl: "/api/chat/messages/", statusSuffix: "/status", onSnapshot: recover });
  const recoverAgent = useCallback((snapshot: AgentRunView) => {
    const currentConversationId = activeConversationRef.current.id;
    if (currentConversationId && snapshot.conversationId !== currentConversationId) {
      updateConversationGeneration(sessionStorage, viewerId, snapshot.conversationId, { agentRunId: snapshot.status === "PENDING" ? snapshot.id : null });
      return;
    }
    setAgentRuns((current) => current.some((run) => run.id === snapshot.id) ? current.map((run) => run.id === snapshot.id ? snapshot : run) : [...current, snapshot]);
    setMessages((current) => current.map((message) => message.id === snapshot.assistantMessageId ? {
      ...message,
      content: snapshot.assistantMessage.content,
      status: snapshot.assistantMessage.status.toLowerCase() as ChatMessageView["status"],
    } : message));
    if (snapshot.status === "PENDING") {
      setGenerationKind("AGENT");
      setGenerating(true);
      setError("Agent 正在后台继续运行。");
    } else {
      clearCurrentGeneration("AGENT");
      setAgentRunId(undefined);
      setGenerating(false);
      setError(snapshot.status === "ERROR" ? "Agent 未能正常完成，请查看 Worker 状态。" : undefined);
    }
  }, [clearCurrentGeneration, viewerId]);
  const recoverAgentStatus = useCallback(async (snapshot: AgentRunStatusSnapshot, context: { signal: AbortSignal }) => {
    const currentConversationId = activeConversationRef.current.id;
    if (currentConversationId && snapshot.conversationId !== currentConversationId) {
      updateConversationGeneration(sessionStorage, viewerId, snapshot.conversationId, { agentRunId: snapshot.id });
      throw new DOMException("Conversation changed during Agent recovery.", "AbortError");
    }
    if (snapshot.status !== "PENDING") {
      const response = await fetch(`/api/agents/${snapshot.id}/terminal`, { cache: "no-store", signal: context.signal });
      if (response.status === 401 || response.status === 404) throw new RecoveryStopError();
      if (!response.ok) throw new Error("Agent 终态暂时无法同步。");
      const terminal = await response.json() as AgentRunTerminalSnapshot;
      const activeConversationId = activeConversationRef.current.id;
      if (activeConversationId && terminal.conversationId !== activeConversationId) {
        updateConversationGeneration(sessionStorage, viewerId, terminal.conversationId, { agentRunId: terminal.id });
        throw new DOMException("Conversation changed during Agent terminal synchronization.", "AbortError");
      }
      setAgentRuns((current) => {
        const existing = current.find((run) => run.id === terminal.id);
        const merged = mergeAgentRunTerminal(existing, terminal);
        return existing ? current.map((run) => run.id === terminal.id ? merged : run) : [...current, merged];
      });
      setMessages((current) => applyAgentTerminalMessage(current, terminal));
      setGenerating(false);
      setError(terminal.status === "ERROR" ? "Agent 未能正常完成，请查看 Worker 状态。" : undefined);
      return;
    }
    setAgentRuns((current) => {
      const existing = current.find((run) => run.id === snapshot.id);
      const merged = mergeAgentRunStatus(existing, snapshot);
      return existing ? current.map((run) => run.id === snapshot.id ? merged : run) : [...current, merged];
    });
    setMessages((current) => current.map((message) => message.id === snapshot.assistantMessageId ? {
      ...message,
      status: snapshot.assistantMessage.status.toLowerCase() as ChatMessageView["status"],
    } : message));
    setGenerationKind("AGENT");
    setGenerating(true);
    setError("Agent 正在后台继续运行。");
  }, [viewerId]);
  const settleAgentRecovery = useCallback(() => {
    setAgentRunId(undefined);
    setGenerating(false);
  }, []);
  useGenerationRecovery({ persistenceKey: `${viewerId}:${conversationKey}:AGENT`, readRunId: readAgentGeneration, writeRunId: writeAgentGeneration, runId: agentRunId, onRunId: setAgentRunId, statusUrl: "/api/agents/", statusSuffix: "/status", onSnapshot: recoverAgentStatus, onSettled: settleAgentRecovery });

  async function refreshAgentRun(runId: string) {
    const response = await fetch(`/api/agents/${runId}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Agent 状态暂时不可用。");
    const snapshot = await response.json() as AgentRunView;
    recoverAgent(snapshot);
    return snapshot;
  }

  async function stopAgentRun(runId?: string) {
    if (!runId) {
      pendingCancelRef.current = true;
      setCancelling(true);
      setError("正在请求停止，等待服务端确认 Agent 运行编号。");
      return;
    }
    setCancelling(true);
    setError("正在请求停止 Agent。");
    try {
      const status = await requestDurableCancellation(`/api/agents/${runId}/cancel`);
      if (status === "CANCELLED") {
        pendingCancelRef.current = false;
        controller?.abort();
        clearCurrentGeneration("AGENT");
        setAgentRunId(undefined);
        setGenerating(false);
        setError(undefined);
        try { await refreshAgentRun(runId); }
        catch { setError("Agent 已停止，完整详情暂时无法刷新。"); }
      } else await refreshAgentRun(runId);
    } catch (reason) {
      setGenerating(true);
      setError(reason instanceof Error ? reason.message : "停止请求未确认，Agent 可能仍在后台运行。");
    } finally {
      setCancelling(false);
    }
  }

  async function stopAgentWorker(runId: string, workerKey: string) {
    const response = await fetch(`/api/agents/${runId}/workers/${encodeURIComponent(workerKey)}/cancel`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? "Worker 停止请求未确认。");
    }
    await refreshAgentRun(runId);
  }

  async function stopGeneration(messageId = assistantMessageId) {
    if (generationKind === "AGENT") {
      await stopAgentRun(agentRunId);
      return;
    }
    if (cancelling && !pendingCancelRef.current) return;
    if (!messageId) {
      pendingCancelRef.current = true;
      setCancelling(true);
      setError("正在请求停止，等待服务端确认任务编号。");
      return;
    }
    setCancelling(true);
    setError("正在请求停止。");
    try {
      const status = await requestDurableCancellation(`/api/chat/messages/${messageId}/cancel`);
      if (status === "CANCELLED") {
        pendingCancelRef.current = false;
        controller?.abort();
        clearCurrentGeneration("CHAT");
        setAssistantMessageId(undefined);
        setGenerating(false);
        setMessages((current) => current.map((message) => message.id === messageId ? { ...message, status: "cancelled" } : message));
        setError(undefined);
      } else {
        const response = await fetch(`/api/chat/messages/${messageId}/status`, { cache: "no-store" });
        if (!response.ok) throw new Error("停止请求未确认，任务可能仍在后台处理。");
        recover(await response.json() as { id: string; conversationId: string; status: string; content: string });
      }
    } catch (reason) {
      setGenerating(true);
      setError(reason instanceof Error ? reason.message : "停止请求未确认，任务可能仍在后台处理。");
    } finally {
      setCancelling(false);
    }
  }

  function selectAssistant(persona?: PersonaChatIdentity) {
    setActivePersona(persona);
    const nextUrl = persona ? `/chat?personaId=${encodeURIComponent(persona.id)}` : "/chat";
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  async function sendMessage(messageToEdit?: ChatMessageView) {
    const content = (messageToEdit ? editValue : draft).trim();
    const requestedMode: ChatGenerationMode = messageToEdit ? "CHAT" : generationMode;
    const configuredForRequest = requestedMode === "CHAT" ? aiConfigured : agentConfigured;
    if (!content || generating || !configuredForRequest) return;

    const editTarget = messageToEdit ? createEditRequestTarget({
      message: messageToEdit,
      conversationId: activeConversationRef.current.id ?? conversation?.id,
      conversationUpdatedAt: activeConversationRef.current.updatedAt,
    }) : undefined;
    if (messageToEdit && !editTarget) {
      setError("正在确认对话，请稍后重试编辑。");
      return;
    }

    const requestController = new AbortController();
    let userId = `user-${crypto.randomUUID()}`;
    let assistantId = `assistant-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let assistantContent = "";
    const priorTitle = activeTitle;
    const editIndex = messageToEdit ? messages.findIndex((message) => message.id === messageToEdit.id) : -1;
    if (messageToEdit && editIndex < 0) return;
    if (messageToEdit) {
      setEditingMessage(undefined);
      setEditValue("");
    } else setDraft("");
    if (!messageToEdit) setGenerationMode("CHAT");
    setError(undefined);
    setGenerating(true);
    setGenerationKind(requestedMode === "CHAT" ? "CHAT" : "AGENT");
    if (requestedMode === "CHAT") setAgentRunId(undefined);
    else setAssistantMessageId(undefined);
    generationControllerRef.current = requestController;
    setController(requestController);
    pendingCancelRef.current = false;
    setCancelling(false);
    pendingStopEditRef.current = false;
    if (!messageToEdit && !activeConversationRef.current.id) {
      setActiveTitle(content.replace(/\s+/g, " ").slice(0, 48));
    }
    const retainedMessages = editIndex >= 0 ? messages.slice(0, editIndex) : messages;
    setMessages([...retainedMessages,
      { id: userId, role: "user", content, status: "complete", createdAt: now, temporary: true },
      { id: assistantId, role: "assistant", content: "", status: "pending", createdAt: now, temporary: true },
    ]);

    let detached = false;
    let terminal = false;
    let confirmedBusinessRun = false;
    let confirmedAgentRunId: string | undefined;
    try {
      const response = await fetch(requestedMode === "CHAT" ? "/api/chat" : "/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          content,
          ...(editTarget ?? { conversationId: activeConversationRef.current.id, ...(!activeConversationRef.current.id && (activePersona?.id || requestedPersonaId) ? { personaId: activePersona?.id || requestedPersonaId } : {}) }),
          ...(requestedMode === "CHAT" ? {} : { mode: requestedMode === "AGENT_DEEP" ? "DEEP" : "STANDARD" }),
        }),
        signal: requestController.signal,
      });

      if (requestedMode === "CHAT") {
        await readSseEvents<ChatStreamEvent>(response, (streamEvent) => {
          if (streamEvent.event === "conversation") {
            const firstConfirmation = !activeConversationRef.current.id;
            activeConversationRef.current = { id: streamEvent.data.conversationId, updatedAt: streamEvent.data.updatedAt };
            setActiveConversationId(streamEvent.data.conversationId);
            confirmConversationKey(streamEvent.data.conversationId);
            if (firstConfirmation && mountedRef.current) window.history.replaceState(window.history.state, "", `/chat/${streamEvent.data.conversationId}`);
          }
          if (streamEvent.event === "turn") {
            confirmedBusinessRun = true;
            const temporaryUserId = userId;
            const temporaryAssistantId = assistantId;
            userId = streamEvent.data.userMessageId;
            assistantId = streamEvent.data.assistantMessageId;
            setAssistantMessageId(assistantId);
            updateConversationGeneration(sessionStorage, viewerId, conversationKeyRef.current, { chatMessageId: assistantId });
            setMessages((current) => confirmOptimisticTurn(current, temporaryUserId, temporaryAssistantId, userId, assistantId));
            setEditingMessage((current) => current?.id === temporaryUserId ? { ...current, id: userId, temporary: false } : current);
            if (pendingStopEditRef.current || pendingCancelRef.current) {
              pendingStopEditRef.current = false;
              void stopGeneration(assistantId);
            }
          }
          if (streamEvent.event === "delta") {
            assistantContent += streamEvent.data.text;
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: assistantContent } : message));
          }
          if (streamEvent.event === "memory") setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, memoryCount: streamEvent.data.count } : message));
          if (streamEvent.event === "done") {
            terminal = true;
            clearCurrentGeneration("CHAT");
            setAssistantMessageId(undefined);
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, id: streamEvent.data.messageId, status: "complete" } : message));
          }
          if (streamEvent.event === "cancelled") {
            terminal = true;
            clearCurrentGeneration("CHAT");
            setAssistantMessageId(undefined);
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "cancelled" } : message));
          }
          if (streamEvent.event === "error") {
            terminal = true;
            clearCurrentGeneration("CHAT");
            setAssistantMessageId(undefined);
            setError(streamEvent.data.message);
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "error" } : message));
          }
        });
      } else {
        await readSseEvents<AgentStreamEvent>(response, (streamEvent) => {
          if (streamEvent.event === "run") {
            confirmedBusinessRun = true;
            const pendingRun = createPendingAgentRunView(streamEvent.data);
            confirmedAgentRunId = pendingRun.id;
            setAgentRunId(pendingRun.id);
            const temporaryUserId = userId;
            const temporaryAssistantId = assistantId;
            userId = pendingRun.userMessageId;
            assistantId = pendingRun.assistantMessageId;
            const firstConfirmation = !activeConversationRef.current.id;
            activeConversationRef.current = { id: pendingRun.conversationId, updatedAt: String(streamEvent.data.conversationUpdatedAt ?? "") };
            setActiveConversationId(pendingRun.conversationId);
            confirmConversationKey(pendingRun.conversationId);
            updateConversationGeneration(sessionStorage, viewerId, pendingRun.conversationId, { agentRunId: pendingRun.id });
            setAgentRuns((current) => [...current.filter((run) => run.id !== pendingRun.id), pendingRun]);
            setMessages((current) => confirmOptimisticTurn(current, temporaryUserId, temporaryAssistantId, userId, assistantId));
            if (firstConfirmation && mountedRef.current) window.history.replaceState(window.history.state, "", `/chat/${pendingRun.conversationId}`);
            if (pendingCancelRef.current) void stopAgentRun(pendingRun.id);
            return;
          }
          if (!confirmedAgentRunId) return;
          setAgentRuns((current) => current.map((run) => run.id === confirmedAgentRunId ? reduceAgentStreamEvent(run, streamEvent) : run));
          if (streamEvent.event === "synthesis_delta") {
            assistantContent += String(streamEvent.data.text ?? "");
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: assistantContent } : message));
          }
          if (streamEvent.event === "done") {
            terminal = true;
            clearCurrentGeneration("AGENT");
            setAgentRunId(undefined);
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "complete" } : message));
          }
          if (streamEvent.event === "cancelled") {
            terminal = true;
            clearCurrentGeneration("AGENT");
            setAgentRunId(undefined);
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "cancelled" } : message));
          }
          if (streamEvent.event === "error") {
            terminal = true;
            clearCurrentGeneration("AGENT");
            setAgentRunId(undefined);
            setError(String(streamEvent.data.message ?? "Agent 未能正常完成。"));
            setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "error" } : message));
          }
        });
        if (terminal && confirmedAgentRunId) await refreshAgentRun(confirmedAgentRunId);
      }

      if (!terminal && !requestController.signal.aborted) {
        detached = true;
        setGenerating(true);
        setError("连接暂时中断，任务仍在后台处理。");
        return;
      }

    } catch (reason) {
      if (!mountedRef.current) {
        detached = true;
        return;
      }
      if (requestController.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, status: "cancelled" } : message));
      } else if (terminal) {
        setError(reason instanceof Error ? reason.message : "最终状态刷新失败，请稍后重新打开对话。");
      } else if (!confirmedBusinessRun) {
        setMessages(messages);
        setActiveTitle(priorTitle);
        setGenerationMode(requestedMode);
        if (messageToEdit) {
          setEditingMessage(messageToEdit);
          setEditValue(content);
        } else {
          setDraft(content);
        }
        setError(reason instanceof Error ? reason.message : "请求未创建，请稍后重试。");
      } else {
        detached = true;
        setGenerating(true);
        setError(requestedMode === "CHAT" ? "连接暂时中断，任务仍在后台处理。" : "连接暂时中断，Agent 仍在后台运行。");
        return;
      }
    } finally {
      if (generationControllerRef.current === requestController) generationControllerRef.current = undefined;
      if (mountedRef.current && !detached) setGenerating(false);
      if (mountedRef.current && !detached) setGenerationKind(undefined);
      if (mountedRef.current) setController(undefined);
      pendingStopEditRef.current = false;
    }
  }

  function beginEdit(message: ChatMessageView) {
    setGenerationMode("CHAT");
    setEditingMessage(message);
    setEditValue(message.content);
    setError(undefined);
    if (generating) {
      if (message.temporary && !activeConversationRef.current.updatedAt) {
        pendingStopEditRef.current = true;
      } else {
        void stopGeneration();
      }
    }
  }

  return (
    <div className="surface-grid app-viewport flex w-full overflow-hidden bg-background" data-chat-shell ref={shellRef}>
      <aside className="hidden w-[17.5rem] shrink-0 border-r border-border/10 bg-background-subtle/82 backdrop-blur-xl md:block"><ConversationList activeId={activeConversationId} conversations={conversationItems} loading={bootstrapLoading} /></aside>
      {drawerOpen && (
        <div className="absolute inset-0 z-50 overflow-hidden bg-overlay/55 backdrop-blur-sm md:hidden" onClick={() => setDrawerOpen(false)}>
          <aside className="flex h-full w-[min(88vw,21rem)] max-w-[calc(100vw-var(--safe-area-right)-.5rem)] flex-col border-r border-border/10 bg-background-subtle pb-[var(--safe-area-bottom)] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex min-h-[calc(var(--mobile-header-height)+var(--safe-area-top))] items-center justify-between border-b border-border/10 px-4 pb-2 pt-[max(.5rem,var(--safe-area-top))]"><div><span className="premium-kicker">CONVERSATIONS</span><p className="text-sm font-semibold">对话历史</p></div><button aria-label="关闭历史" className="grid size-11 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground" onClick={() => setDrawerOpen(false)} type="button"><X className="size-5" /></button></div>
            <ConversationList activeId={activeConversationId} conversations={conversationItems} loading={bootstrapLoading} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}
      <section className="flex min-w-0 flex-1 flex-col bg-background/72">
        <header className="flex min-h-[calc(var(--mobile-header-height)+var(--safe-area-top))] shrink-0 items-center gap-1 border-b border-border/10 bg-surface/72 px-[max(.5rem,var(--safe-area-left))] pb-2 pt-[max(.5rem,var(--safe-area-top))] backdrop-blur-xl min-[360px]:gap-1.5 min-[360px]:px-[max(.625rem,var(--safe-area-left))] sm:gap-2 sm:px-4 md:min-h-[4.25rem] md:gap-3 md:px-6 md:py-0">
          <button aria-label="打开对话历史" className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground md:hidden" onClick={() => setDrawerOpen(true)} type="button"><Menu className="size-5" /></button>
          <Link aria-label={CHAT_HOME_NAVIGATION.label} className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground md:hidden" href={CHAT_HOME_NAVIGATION.href} title={CHAT_HOME_NAVIGATION.title}><House className="size-5" /></Link>
          <Link aria-label={CHAT_HOME_NAVIGATION.label} className="shrink-0" href={CHAT_HOME_NAVIGATION.href} title={CHAT_HOME_NAVIGATION.title}>{conversation?.persona || activePersona ? <PersonaAvatar className="size-8 rounded-xl" name={(conversation?.persona || activePersona)!.name} src={(conversation?.persona || activePersona)!.avatarUrl} /> : <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"><Sparkles className="size-4" /></span>}</Link>
          <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold tracking-[-.01em]">{activeTitle ?? activePersona?.name ?? "新对话"}</h1><p className="truncate text-xs text-muted-foreground">{conversation?.persona ? `${conversation.persona.description || "AI 人格助手"}${conversation.persona.archived ? " · 已在回收站" : ""}` : activePersona?.description || (activePersona ? "AI 人格助手" : "默认 AI 助手")}</p></div>
          {!activeConversationId && <button aria-label="选择助手" className="grid size-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground xl:hidden" onClick={() => setAssistantDrawerOpen(true)} title="选择助手" type="button"><Bot className="size-5" /></button>}
          {generating && <span className="premium-chip hidden shrink-0 border-primary/15 bg-primary-subtle text-primary-subtle-foreground sm:inline-flex"><span className="size-1.5 animate-pulse rounded-full bg-primary" />{cancelling ? "正在请求停止" : "正在生成"}</span>}
        </header>
        {generationMode === "CHAT" && !aiConfigured ? <div className="border-b border-warning/16 bg-warning-subtle/72 px-4 py-2.5 text-center text-sm text-warning-foreground">AI 服务尚未配置。请由管理员设置服务端 AI 环境变量。</div> : null}
        {generationMode !== "CHAT" && !agentConfigured ? <div className="border-b border-warning/16 bg-warning-subtle/72 px-4 py-2.5 text-center text-sm text-warning-foreground">Agent 服务尚未配置。请由管理员设置服务端 Agent 环境变量。</div> : null}
        {error && <div className="border-b border-destructive/16 bg-destructive-subtle/76 px-4 py-2.5 text-center text-sm text-destructive-foreground" role="alert">{error}</div>}
        {conversation?.persona?.archived && <DeletedPersonaNotice personaId={conversation.persona.id} />}
        <div className="flex min-h-0 min-w-0 flex-1"><main className="flex min-w-0 flex-1 flex-col"><MessageList
          agentRuns={agentRuns}
          editDisabled={generating}
          editingMessageId={editingMessage?.id}
          editValue={editValue}
          maxInputChars={maxInputChars}
          messages={messages}
          onCancelAgentRun={stopAgentRun}
          onCancelAgentWorker={stopAgentWorker}
          onRequestAgentDetails={async (runId) => { await refreshAgentRun(runId); }}
          onBeginEdit={beginEdit}
          onCancelEdit={() => { setEditingMessage(undefined); setEditValue(""); pendingStopEditRef.current = false; }}
          onEditChange={setEditValue}
          onSubmitEdit={() => { if (editingMessage) void sendMessage(editingMessage); }}
          persona={conversation?.persona || activePersona}
        />
        <ChatComposer
          agentConfigured={agentConfigured}
          disabledReason={getComposerDisabledReason(generationMode === "CHAT" ? aiConfigured : agentConfigured, Boolean(editingMessage), Boolean(conversation?.persona?.archived), clientReady)}
          generating={generating}
          stopping={cancelling}
          maxInputChars={maxInputChars}
          mode={generationMode}
          onChange={setDraft}
          onModeChange={setGenerationMode}
          onSend={() => void sendMessage()}
          onStop={() => void stopGeneration()}
          value={draft}
        />
        </main>{!activeConversationId && <AssistantSelectorPanel loading={bootstrapLoading} onSelect={selectAssistant} personas={personaItems} selectedId={activePersona?.id || requestedPersonaId} />}</div>
        {!activeConversationId && assistantDrawerOpen && <AssistantSelectorPanel loading={bootstrapLoading} mobile onClose={() => setAssistantDrawerOpen(false)} onSelect={selectAssistant} personas={personaItems} selectedId={activePersona?.id || requestedPersonaId} />}
      </section>
    </div>
  );
}
