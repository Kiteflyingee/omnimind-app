'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Trash2, ShieldCheck, Database, Zap, Clock, HelpCircle } from 'lucide-react';
import { cn } from './ui/core';

interface Rule {
  id: string;
  content: string;
}

export default function MemoryDrawer({ isOpen, onClose, sessionId, userId }: { isOpen: boolean; onClose: () => void; sessionId: string; userId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [useMemory, setUseMemory] = useState(false);
  const [recentContext, setRecentContext] = useState(-1);
  const [showTooltip, setShowTooltip] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    const savedMemory = localStorage.getItem('aimin_use_memory');
    if (savedMemory !== null) {
      setUseMemory(savedMemory === 'true');
    }
    const savedContext = localStorage.getItem('aimin_recent_context');
    if (savedContext !== null) {
      setRecentContext(parseInt(savedContext, 10));
    }
  }, []);

  const toggleMemory = () => {
    const nextValue = !useMemory;
    setUseMemory(nextValue);
    localStorage.setItem('aimin_use_memory', String(nextValue));
  };

  const contextOptions = [
    { label: '0', value: 0 },
    { label: '20', value: 20 },
    { label: '40', value: 40 },
    { label: '60', value: 60 },
    { label: '不限', value: -1 },
  ];

  const handleContextChange = (value: number) => {
    setRecentContext(value);
    localStorage.setItem('aimin_recent_context', String(value));
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

  const fetchRules = async () => {
    try {
      const res = await fetch(`${apiUrl}/rules?sessionId=${sessionId}&userId=${userId}`);
      const data = await res.json();
      setRules(data);
    } catch (e) {
      console.error('Failed to fetch rules', e);
    }
  };

  useEffect(() => {
    if (isOpen && userId) fetchRules();
  }, [isOpen, sessionId, userId]);

  const deleteRule = async (id: string) => {
    await fetch(`${apiUrl}/rules`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, userId, sessionId }),
    });
    fetchRules();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-[90%] max-w-md bg-white z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">记忆中心</h2>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Memory Center</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-200/50 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold text-slate-700">硬性契约 (Hard Rules)</h3>
                </div>
                {Array.isArray(rules) && rules.length === 0 && (
                  <div className="p-8 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <Database className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">尚无存储的硬性规则</p>
                  </div>
                )}
                {Array.isArray(rules) && rules.length > 0 && (
                  <div className="grid gap-3">
                    {rules.map((rule) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={rule.id}
                        className="group flex items-start justify-between gap-3 p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 transition-all"
                      >
                        <p className="text-sm text-slate-600 leading-relaxed">{rule.content}</p>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-slate-700">柔性事实 (Soft Facts)</h3>
                  </div>
                  <button
                    onClick={toggleMemory}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      useMemory ? "bg-blue-600" : "bg-slate-200"
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        useMemory ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
                <div className={cn(
                  "p-4 rounded-2xl border transition-all",
                  useMemory ? "bg-amber-50/50 border-amber-100" : "bg-slate-50 border-slate-100 grayscale"
                )}>
                  <p className={cn("text-xs leading-relaxed", useMemory ? "text-amber-700" : "text-slate-400")}>
                    {useMemory ? "柔性事实由 Mem0 向量库自动管理，用于增强 AI 的上下文感知能力。" : "柔性事实已禁用。AI 将不再检索长效记忆，响应速度将得到提升。"}
                  </p>
                  <div className={cn(
                    "mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight",
                    useMemory ? "text-amber-400" : "text-slate-300"
                  )}>
                    <span className={cn("w-1 h-1 rounded-full", useMemory ? "bg-amber-400" : "bg-slate-300")} />
                    {useMemory ? "Cloud Sync Active" : "Sync Disabled"}
                  </div>
                </div>
              </section>

              {/* Recent Context Section */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <h3 className="font-bold text-slate-700">近期上下文</h3>
                  <div className="relative">
                    <button
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                    {showTooltip && (
                      <div className="absolute left-6 top-0 w-56 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-10">
                        此设置让模型更专注于最近的对话，不影响长效记忆。（如果开启柔性事实，建议设置保留20条上下文，让模型更加专注）
                        <div className="absolute left-0 top-2 -translate-x-1 w-2 h-2 bg-slate-800 rotate-45" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-2xl border bg-blue-50/50 border-blue-100">
                  <div className="flex gap-2">
                    {contextOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleContextChange(opt.value)}
                        className={cn(
                          "flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all",
                          recentContext === opt.value
                            ? "bg-blue-600 text-white shadow-md"
                            : "bg-white text-slate-600 hover:bg-blue-100 border border-blue-100"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-blue-600">
                    当前：保留最近 {recentContext === -1 ? '全部' : recentContext === 0 ? '0 条' : `${recentContext} 条`} 对话
                  </p>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] text-center text-slate-400 leading-relaxed">
                AiMin 使用分层存储架构，确保您的隐私与核心指令永久留存。
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}