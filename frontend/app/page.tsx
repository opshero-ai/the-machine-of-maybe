"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getTodaysFact, getFactArchive, streamChat, type Fact, type ChatChunk } from "@/lib/api";
import { CATEGORY_CONFIG, type FactCategory } from "@/types/entities";

// ─── Chat Message Type ───

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// ─── Animation Variants ───

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};

// ─── Page Component ───

export default function HomePage() {
  const [fact, setFact] = useState<Fact | null>(null);
  const [factLoading, setFactLoading] = useState(true);
  const [factError, setFactError] = useState<string | null>(null);

  const [archive, setArchive] = useState<Fact[]>([]);
  const [showArchive, setShowArchive] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load today's fact
  useEffect(() => {
    (async () => {
      const { fact: f, error } = await getTodaysFact();
      if (f) setFact(f);
      if (error) setFactError(error);
      setFactLoading(false);
    })();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLoadArchive = useCallback(async () => {
    if (archive.length > 0) {
      setShowArchive(!showArchive);
      return;
    }
    const { facts } = await getFactArchive(14);
    setArchive(facts);
    setShowArchive(true);
  }, [archive, showArchive]);

  const handleShareFact = useCallback(() => {
    if (!fact) return;
    const text = `Did You Know? ${fact.fact}\n\n${fact.explanation}\n\nhttps://korondy.com`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [fact]);

  const handleSendMessage = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || isStreaming) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsStreaming(true);

    const assistantMsg: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      for await (const chunk of streamChat(msg, conversationId)) {
        if (chunk.type === "meta" && chunk.conversation_id) {
          setConversationId(chunk.conversation_id);
        }
        if (chunk.type === "text" && chunk.content) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + chunk.content };
            }
            return updated;
          });
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: "Sorry, I had trouble connecting. Try again in a moment!",
          };
        }
        return updated;
      });
    }
    setIsStreaming(false);
  }, [chatInput, isStreaming, conversationId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const categoryInfo = fact ? CATEGORY_CONFIG[fact.category as FactCategory] : null;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── Hero: Today's Fact ─── */}
      <section className="flex-shrink-0 px-6 pt-12 pb-8 sm:pt-16 sm:pb-12">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="mx-auto max-w-3xl text-center"
        >
          {/* Badge */}
          <motion.div variants={fadeUp} className="mb-8">
            <a
              href="https://opshero.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: "var(--color-surface-raised)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-surface-overlay)",
              }}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-accent)" }} />
              Built by OpsHero
            </a>
          </motion.div>

          {/* Title */}
          <motion.h1
            variants={fadeUp}
            className="text-4xl font-light tracking-tight sm:text-5xl md:text-6xl"
            style={{ color: "var(--color-text-primary)" }}
          >
            Did You{" "}
            <span className="font-semibold" style={{ color: "var(--color-accent)" }}>
              Know?
            </span>
          </motion.h1>

          {/* Fact Card */}
          <motion.div variants={fadeUp} className="mt-10">
            {factLoading ? (
              <div
                className="rounded-2xl p-8 animate-pulse"
                style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-surface-overlay)" }}
              >
                <div className="h-6 rounded-lg w-3/4 mx-auto mb-4" style={{ background: "var(--color-surface-overlay)" }} />
                <div className="h-4 rounded w-full mb-2" style={{ background: "var(--color-surface-overlay)" }} />
                <div className="h-4 rounded w-2/3 mx-auto" style={{ background: "var(--color-surface-overlay)" }} />
              </div>
            ) : factError ? (
              <div className="rounded-2xl p-8" style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-surface-overlay)" }}>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Couldn&apos;t load today&apos;s fact. {factError}
                </p>
              </div>
            ) : fact ? (
              <div
                className="rounded-2xl p-8 text-left"
                style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-surface-overlay)" }}
              >
                {/* Category + Rating */}
                <div className="flex items-center justify-between mb-5">
                  {categoryInfo && (
                    <span
                      className="rounded-full px-3 py-1 text-xs font-medium"
                      style={{ background: `${categoryInfo.color}15`, color: categoryInfo.color }}
                    >
                      {categoryInfo.icon} {categoryInfo.label}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-2 w-2 rounded-full transition-all"
                        style={{
                          background: i < fact.mind_blown_rating ? "var(--color-accent)" : "var(--color-surface-overlay)",
                        }}
                      />
                    ))}
                    <span className="ml-1 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {fact.mind_blown_rating}/10
                    </span>
                  </div>
                </div>

                {/* The Fact */}
                <h2 className="text-xl font-semibold leading-relaxed sm:text-2xl" style={{ color: "var(--color-text-primary)" }}>
                  {fact.fact}
                </h2>

                {/* Explanation */}
                <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                  {fact.explanation}
                </p>

                {/* Source */}
                <p className="mt-3 text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                  Source: {fact.source_hint}
                </p>

                {/* Follow-up Question */}
                <div
                  className="mt-5 rounded-xl p-4"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-surface-overlay)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--color-accent)" }}>
                    Think about it:
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {fact.follow_up_question}
                  </p>
                </div>

                {/* Related Facts */}
                {fact.related_facts?.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
                      Related
                    </p>
                    {fact.related_facts.map((rf, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: "var(--color-accent-dim)" }} />
                        <span style={{ color: "var(--color-text-secondary)" }}>{rf}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={handleShareFact}
                    className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
                    style={{
                      background: copied ? "var(--color-accent)20" : "var(--color-surface)",
                      color: copied ? "var(--color-accent)" : "var(--color-text-secondary)",
                      border: `1px solid ${copied ? "var(--color-accent)40" : "var(--color-surface-overlay)"}`,
                    }}
                  >
                    {copied ? "Copied!" : "Share this fact"}
                  </button>
                  <button
                    onClick={handleLoadArchive}
                    className="rounded-lg px-4 py-2 text-xs font-medium transition-colors"
                    style={{
                      background: "var(--color-surface)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-surface-overlay)",
                    }}
                  >
                    {showArchive ? "Hide archive" : "Past facts"}
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>

          {/* Archive */}
          <AnimatePresence>
            {showArchive && archive.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 overflow-hidden"
              >
                <div className="space-y-3">
                  {archive
                    .filter((a) => a.date !== fact?.date)
                    .map((a) => {
                      const cat = CATEGORY_CONFIG[a.category as FactCategory];
                      return (
                        <div
                          key={a.date}
                          className="rounded-xl p-4 text-left"
                          style={{ background: "var(--color-surface-raised)", border: "1px solid var(--color-surface-overlay)" }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                              {a.date}
                            </span>
                            {cat && (
                              <span className="text-xs" style={{ color: cat.color }}>
                                {cat.icon} {cat.label}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {a.fact}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            {a.explanation}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* ─── Chat Section ─── */}
      <section className="flex-1 flex flex-col px-6 pb-8">
        <div className="mx-auto w-full max-w-3xl flex-1 flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1" style={{ background: "var(--color-surface-overlay)" }} />
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-muted)" }}>
              Ask me anything
            </h2>
            <div className="h-px flex-1" style={{ background: "var(--color-surface-overlay)" }} />
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto rounded-xl p-4 mb-4 space-y-4"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-surface-overlay)",
              minHeight: "200px",
              maxHeight: "400px",
            }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <p className="text-3xl mb-3 opacity-30">?</p>
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Ask about today&apos;s fact, or anything you&apos;re curious about.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {[
                    "Tell me more about today's fact",
                    "What's the most surprising thing about space?",
                    "Why do we dream?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setChatInput(suggestion);
                        inputRef.current?.focus();
                      }}
                      className="rounded-full px-3 py-1.5 text-xs transition-colors"
                      style={{
                        background: "var(--color-surface)",
                        color: "var(--color-text-secondary)",
                        border: "1px solid var(--color-surface-overlay)",
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
                  style={
                    msg.role === "user"
                      ? { background: "var(--color-accent)", color: "var(--color-text-inverse)" }
                      : { background: "var(--color-surface)", color: "var(--color-text-primary)" }
                  }
                >
                  {msg.content || (
                    <span className="flex items-center gap-1">
                      <span className="typing-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-text-muted)" }} />
                      <span className="typing-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-text-muted)" }} />
                      <span className="typing-dot inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-text-muted)" }} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              rows={2}
              className="w-full resize-none rounded-xl border-2 px-4 py-3 pr-14 text-sm leading-relaxed transition-all placeholder:opacity-40"
              style={{
                background: "var(--color-surface-raised)",
                borderColor: chatInput ? "var(--color-accent)" : "var(--color-surface-overlay)",
                color: "var(--color-text-primary)",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent)";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(226, 163, 54, 0.12)";
              }}
              onBlur={(e) => {
                if (!chatInput) e.currentTarget.style.borderColor = "var(--color-surface-overlay)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isStreaming}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
              style={{
                background: chatInput.trim() && !isStreaming ? "var(--color-accent)" : "var(--color-surface-overlay)",
                color: chatInput.trim() && !isStreaming ? "var(--color-text-inverse)" : "var(--color-text-muted)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.5 8L13 2.5 10 8l3 5.5z" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t px-6 py-6 text-center" style={{ borderColor: "var(--color-surface-overlay)" }}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Built with organized intelligence.{" "}
          <a
            href="https://opshero.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors duration-200"
            style={{ color: "var(--color-text-secondary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-secondary)"; }}
          >
            OpsHero
          </a>
        </p>
      </footer>
    </div>
  );
}
