import React, { useState, useEffect, useRef } from 'react';
import {
  apiService,
  AiChatMessage,
  AiChatMeta,
  MachineHealthResponse,
} from '../services/api';
import {
  MessageSquareText,
  Send,
  Loader2,
  AlertTriangle,
  Info,
  ShieldCheck,
  Sparkles,
  User,
  Bot,
  RotateCcw,
} from 'lucide-react';

interface AiAssistantPanelProps {
  machineHealth?: MachineHealthResponse | null;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta?: AiChatMeta;
  timestamp: string;
}

const QUICK_QUESTIONS = [
  'What is happening?',
  'Why this recommendation?',
  'What should I check?',
  'Is the evidence reliable?',
  'Which signal matters most?',
];

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ machineHealth }) => {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestMeta, setLatestMeta] = useState<AiChatMeta | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Read recorded maintenance history from localStorage safely
  const getRecordedMaintenanceHistory = (): any[] => {
    try {
      const raw = localStorage.getItem('machpulse_maintenance_records');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || loading) return;

    setError(null);
    setInputMessage('');

    const userMsg: MessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Bounded history sent to API (last 10 messages)
    const currentHistory = messages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const maintenanceHistory = getRecordedMaintenanceHistory();
      const res = await apiService.postAiChat(query, currentHistory, maintenanceHistory);

      const assistantMsg: MessageItem = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        meta: res.meta,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setLatestMeta(res.meta);
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(
        err?.message || 'Failed to reach the MachPulse AI Assistant service (/api/ai/chat).'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setLatestMeta(null);
  };

  const providerLabel = latestMeta?.provider_label || 'DETERMINISTIC';
  const isDeterministic = latestMeta?.mode === 'deterministic_fallback' || !latestMeta;
  const isInsufficientEvidence =
    latestMeta?.evidence_sufficient === false ||
    latestMeta?.ml_decision === 'INSUFFICIENT EVIDENCE' ||
    machineHealth?.decision === 'INSUFFICIENT EVIDENCE';

  return (
    <section className="bg-white border-4 border-black rounded-[32px] p-6 sm:p-8 shadow-[8px_8px_0_#000] space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black/20 pb-4">
        <div>
          <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500">
            INTERACTIVE MAINTENANCE INTELLIGENCE
          </span>
          <h3 className="font-comic text-2xl font-bold text-black flex items-center gap-2">
            <MessageSquareText className="w-6 h-6 text-sky-700" />
            Technician AI Assistant
            <span
              className={`text-[10px] font-mono font-black px-2.5 py-0.5 rounded-full border-2 border-black tracking-wide ${
                latestMeta?.mode === 'llm'
                  ? 'bg-[#70C5F8] text-black'
                  : 'bg-slate-200 text-slate-700'
              }`}
              title={
                latestMeta?.mode === 'llm'
                  ? `Response provided by ${providerLabel}`
                  : 'Deterministic fallback mode (no ungrounded model text)'
              }
            >
              {providerLabel}
            </span>
          </h3>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Ask targeted diagnostic questions grounded strictly in sensor evidence and verified ML decisions.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="px-3 py-1.5 rounded-xl border-2 border-black text-xs font-mono font-black bg-[#FFFDF0] hover:bg-rose-100 text-slate-700 cursor-pointer shadow-[2px_2px_0_#000] flex items-center gap-1.5 transition-colors"
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode & Safety Indicators */}
      <div className="space-y-2">
        {/* Deterministic Indicator */}
        {isDeterministic && (
          <div className="p-3 bg-[#FFFDF0] rounded-xl border border-black/20 text-[11px] font-medium text-slate-700 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 text-sky-700 mt-0.5" />
            <div>
              <strong>DETERMINISTIC FALLBACK ACTIVE:</strong> Responses are generated deterministically using rule-based physical domain evidence. No ungrounded LLM inference is being used.
            </div>
          </div>
        )}

        {/* Evidence Limitation Alert */}
        {isInsufficientEvidence && (
          <div className="p-3 bg-[#FFE600] rounded-xl border-2 border-black text-xs font-bold text-black flex items-start gap-2">
            <AlertTriangle className="w-4.5 h-4.5 shrink-0 text-black mt-0.5" />
            <div>
              <strong>INSUFFICIENT EVIDENCE LIMITATION:</strong> Quality gate coverage is below acceptable operational thresholds. Machine condition cannot be evaluated with statistical confidence. Ask questions cautiously.
            </div>
          </div>
        )}
      </div>

      {/* Quick Questions Shortcuts */}
      <div className="space-y-2">
        <span className="text-[10px] font-mono font-black uppercase tracking-widest text-slate-500 block">
          QUICK DIAGNOSTIC QUESTIONS
        </span>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => handleSendMessage(q)}
              disabled={loading}
              className="px-3 py-1.5 bg-[#FFFDF0] hover:bg-[#FFE600] border-2 border-black rounded-xl text-xs font-semibold text-black cursor-pointer transition-colors shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Window */}
      <div className="bg-[#FFFDF0] border-2 border-black rounded-2xl p-4 min-h-[220px] max-h-[380px] overflow-y-auto space-y-4">
        {messages.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Sparkles className="w-8 h-8 text-sky-600 mx-auto opacity-70" />
            <p className="text-xs font-mono font-bold text-slate-600">
              Select a quick question above or enter a diagnostic inquiry below.
            </p>
            <p className="text-[11px] text-slate-500">
              AI responses rely strictly on Mahalanobis distance, signal statistics, and logged maintenance events.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-[#C1F6C9] border-2 border-black flex items-center justify-center shrink-0 mt-0.5 shadow-[1px_1px_0_#000]">
                  <Bot className="w-4 h-4 text-black" />
                </div>
              )}

              <div
                className={`p-3.5 rounded-2xl border-2 border-black max-w-[85%] text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#70C5F8] text-black font-semibold shadow-[2px_2px_0_#000]'
                    : 'bg-white text-slate-900 font-medium shadow-[2px_2px_0_#000]'
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-1">
                  <span className="font-mono text-[10px] font-black uppercase text-slate-500">
                    {msg.role === 'user' ? 'Technician' : `Assistant (${msg.meta?.provider_label || 'SYS'})`}
                  </span>
                  <span className="font-mono text-[9px] text-slate-400">{msg.timestamp}</span>
                </div>
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {msg.meta?.fallback_reason && (
                  <div className="mt-2 pt-1.5 border-t border-black/10 text-[10px] font-mono text-slate-500">
                    Note: Fallback reason — {msg.meta.fallback_reason}
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-[#FFE600] border-2 border-black flex items-center justify-center shrink-0 mt-0.5 shadow-[1px_1px_0_#000]">
                  <User className="w-4 h-4 text-black" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-3 justify-start">
            <div className="w-7 h-7 rounded-lg bg-[#C1F6C9] border-2 border-black flex items-center justify-center shrink-0 shadow-[1px_1px_0_#000]">
              <Bot className="w-4 h-4 text-black" />
            </div>
            <div className="p-3 bg-white border-2 border-black rounded-2xl text-xs font-mono font-bold text-slate-600 flex items-center gap-2 shadow-[2px_2px_0_#000]">
              <Loader2 className="w-4 h-4 animate-spin text-sky-700" />
              <span>Analyzing telemetry evidence & generating response…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-[#FFB3B3] border-2 border-black rounded-xl text-xs font-bold text-black flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-black" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs underline font-mono text-black hover:opacity-75 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Text Input Control */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Ask the technician AI assistant about machine state or evidence..."
          className="flex-1 px-4 py-3 bg-white border-2 border-black rounded-xl text-xs font-medium text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={loading || !inputMessage.trim()}
          className="px-5 py-3 bg-[#C1F6C9] hover:bg-[#9BE3A8] border-2 border-black rounded-xl text-xs font-mono font-black text-black cursor-pointer shadow-[2px_2px_0_#000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-2 disabled:opacity-50 shrink-0 transition-colors"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Send</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
};
