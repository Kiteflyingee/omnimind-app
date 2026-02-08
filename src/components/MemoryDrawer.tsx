'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Trash2, ShieldCheck, Database, Zap } from 'lucide-react';

interface Rule {
  id: string;
  content: string;
}

export default function MemoryDrawer({ isOpen, onClose, sessionId, userId }: { isOpen: boolean; onClose: () => void; sessionId: string; userId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);

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
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-slate-700">柔性事实 (Soft Facts)</h3>
                </div>
                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    柔性事实由 Mem0 向量库自动管理，用于增强 AI 的上下文感知能力。
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-amber-400 uppercase tracking-tight">
                    <span className="w-1 h-1 rounded-full bg-amber-400" />
                    Cloud Sync Active
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <p className="text-[10px] text-center text-slate-400 leading-relaxed">
                OmniMind 使用分层存储架构，确保您的隐私与核心指令永久留存。
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}