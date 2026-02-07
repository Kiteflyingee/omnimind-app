'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Sparkles, User, Bot, ImagePlus, X, Loader2, ChevronDown, ChevronUp, Zap, Command } from 'lucide-react';
import { Button, Input, cn } from './ui/core';
import MemoryDrawer from './MemoryDrawer';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  image?: string;
  isStreaming?: boolean;
}

const NeuralPulse = () => (
  <div className="absolute inset-0 overflow-hidden rounded-inherit pointer-events-none">
    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-blue-500/5 animate-[pulse_3s_ease-in-out_infinite]" />
  </div>
);

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isReasoningEnabled, setIsReasoningEnabled] = useState(true);
  const [showThought, setShowThought] = useState<Record<number, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sessionId = 'demo-user-123';

  // 改进的滚动逻辑：流式输出时禁用平滑，确保零延迟跟随
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const lastMsg = messages[messages.length - 1];
    const isStreaming = lastMsg?.isStreaming;

    if (isStreaming) {
      // 流式输出时：强制瞬间到底，不产生平滑动画冲突
      container.scrollTop = container.scrollHeight;
    } else {
      // 静态更新时：使用平滑滚动
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const toggleThought = (index: number) => {
    setShowThought(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !image) || isLoading) return;

    const userMsg = input.trim();
    const currentImage = image;
    setInput('');
    setImage(null);
    
    setMessages((prev) => [...prev, { 
      role: 'user', 
      content: userMsg,
      image: currentImage || undefined
    }]);
    
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg, 
          image: currentImage, 
          sessionId,
          reasoning: isReasoningEnabled 
        }),
      });

      if (!response.ok) throw new Error('发送失败');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMsg = '';
      let assistantThought = '';
      const msgIndex = messages.length + 1;

      setMessages((prev) => [...prev, { role: 'assistant', content: '', thought: '', isStreaming: true }]);
      setIsLoading(false);
      setShowThought(prev => ({ ...prev, [msgIndex]: true }));

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split(/(?=[tc]:)/);
        
        for (const line of lines) {
          if (line.startsWith('t:')) assistantThought += line.slice(2);
          else if (line.startsWith('c:')) assistantMsg += line.slice(2);
        }
        
        setMessages((prev) => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content = assistantMsg;
            lastMsg.thought = assistantThought;
          }
          return newMsgs;
        });
      }

      setMessages((prev) => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.isStreaming = false;
        }
        return newMsgs;
      });

    } catch (error) {
      console.error('Chat error:', error);
      setIsLoading(false);
      setMessages((prev) => [...prev, { role: 'assistant', content: '同步数据失败。' }]);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white overflow-hidden font-sans antialiased text-slate-900">
      <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/60 backdrop-blur-3xl sticky top-0 z-40">
        <button onClick={() => setIsDrawerOpen(true)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-all text-slate-400">
          <Command className="w-5 h-5" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 mb-0.5">OmniMind</span>
          <h1 className="text-lg font-black tracking-tight">神经中枢</h1>
        </div>
        <div className="w-10" />
      </header>

      {/* 移除全局 scroll-smooth，避免与 JS 滚动冲突 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar bg-[radial-gradient(#f1f5f9_1px,transparent_1px)] [background-size:20px_20px]">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full text-center space-y-6 py-12">
              <div className="w-16 h-16 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-xl">
                <Sparkles className="w-8 h-8 text-blue-400" />
              </div>
              <p className="text-slate-400 text-sm">OmniMind 已就绪</p>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <div className={cn(
                "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                msg.role === 'user' ? "bg-slate-900" : "bg-white border border-slate-100"
              )}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className={cn("w-5 h-5 text-blue-600", msg.isStreaming && "animate-pulse")} />}
              </div>

              <div className={cn("max-w-[85%] space-y-3", msg.role === 'user' ? "items-end" : "items-start")}>
                {msg.image && (
                  <div className="p-1 bg-white rounded-3xl shadow-lg border border-slate-100">
                    <img src={msg.image} alt="Upload" className="max-w-xs rounded-2xl" />
                  </div>
                )}
                
                {msg.thought && (
                  <div className="w-full space-y-2">
                    <button onClick={() => toggleThought(i)} className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      <div className={cn("w-1 h-1 rounded-full", msg.isStreaming && msg.content === '' ? "bg-blue-500 animate-ping" : "bg-slate-300")} />
                      思考过程
                    </button>
                    {showThought[i] && (
                      <div className="relative bg-slate-50/80 rounded-3xl px-5 py-4 text-[13px] text-slate-500 leading-relaxed border border-slate-200/50">
                        <NeuralPulse />
                        <div className="relative z-10 whitespace-pre-wrap font-mono">{msg.thought}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* 
                  关键点：在流式输出时禁用 layout 属性。
                  只有在静态显示（非输出中）时才启用平滑动画。
                */}
                <motion.div 
                  layout={msg.isStreaming ? false : "position"}
                  initial={msg.isStreaming ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", damping: 30, stiffness: 200 }}
                  className={cn(
                  "rounded-[1.8rem] px-6 py-3.5 text-[15px] shadow-sm leading-[1.6] relative",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none font-medium shadow-blue-50" 
                    : "bg-white text-slate-800 border border-slate-100 rounded-tl-none"
                )}>
                  <div className="whitespace-pre-wrap break-words">
                    {msg.content}
                    {msg.isStreaming && msg.content !== '' && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 rounded-full align-middle animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          ))}
        </AnimatePresence>
      </div>

      <div className="p-6 bg-white border-t border-slate-100 shrink-0">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => setIsReasoningEnabled(!isReasoningEnabled)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black transition-all border uppercase tracking-wider",
                isReasoningEnabled ? "bg-blue-600 text-white border-blue-500" : "bg-slate-50 text-slate-400 border-slate-100"
              )}
            >
              <Zap className="w-3 h-3" />
              思考模式 {isReasoningEnabled ? '开' : '关'}
            </button>
          </div>

          <AnimatePresence>
            {image && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative inline-block">
                <img src={image} alt="Preview" className="h-20 w-20 object-cover rounded-2xl border p-1 bg-white shadow-xl" />
                <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-slate-900 text-white rounded-full p-1 shadow-lg hover:bg-rose-500"><X className="w-3 h-3" /></button>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="flex gap-3 items-center">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl border border-slate-100 hover:text-blue-500 transition-colors shrink-0">
              <ImagePlus className="w-5 h-5" />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImageChange} accept="image/*" className="hidden" />
            <div className="flex-1 relative">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="构建意图..." className="w-full h-12 px-6 rounded-2xl bg-slate-50 border-none focus:ring-2 focus:ring-blue-500/20 transition-all outline-none text-[15px]" />
              <button type="submit" disabled={(!input.trim() && !image) || isLoading} className="absolute right-1.5 top-1.5 w-9 h-9 bg-blue-600 text-white flex items-center justify-center rounded-xl shadow-lg disabled:opacity-20 transition-all active:scale-90">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <MemoryDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .whitespace-pre-wrap { line-height: 1.6; word-wrap: break-word; }
      `}</style>
    </div>
  );
}
