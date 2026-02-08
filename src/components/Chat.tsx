'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Settings, Sparkles, User, Bot, ImagePlus, X, Loader2, ChevronDown, ChevronUp, Zap, Command, Plus, Trash2, Menu, PanelLeft, Layers, Search, Brain, Wrench } from 'lucide-react';
import { Button, Input, cn } from './ui/core';
import MemoryDrawer from './MemoryDrawer';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  status?: string;
  image?: string;
  isStreaming?: boolean;
  isThoughtExpanded?: boolean;
}

interface UserProfile {
  id: string;
  username: string;
}

interface Session {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: number;
}

const NeuralPulse = () => (
  <div className="absolute inset-0 overflow-hidden rounded-inherit pointer-events-none">
    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-blue-500/5 animate-[pulse_3s_ease-in-out_infinite]" />
  </div>
);

const NeuralBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none bg-slate-50">
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/5 blur-[120px] rounded-full animate-pulse" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/5 blur-[120px] rounded-full animate-pulse [animation-delay:2s]" />
    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
    <div className="absolute inset-0" style={{
      backgroundImage: `radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.03) 1px, transparent 0)`,
      backgroundSize: '32px 32px'
    }} />
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [isLoginLoading, setIsLoginLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load user and sessions on mount
  useEffect(() => {
    setMounted(true);
    if (window.innerWidth > 1024) setIsSidebarOpen(true);

    const savedUser = localStorage.getItem('omnimind-user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      setCurrentUser(user);
      loadSessions(user.id);
    }
  }, []);

  const loadSessions = async (userId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/sessions/${userId}`);
      if (response.ok) {
        const data = await response.json();
        const formattedSessions: Session[] = data.map((s: any) => ({
          id: s.id,
          title: s.title,
          updatedAt: new Date(s.updated_at).getTime()
        }));
        setSessions(formattedSessions);
        if (formattedSessions.length > 0) {
          setActiveSessionId(formattedSessions[0].id);
        } else {
          createNewSession(userId);
        }
      }
    } catch (e) {
      console.error('Failed to load sessions from server', e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || isLoginLoading) return;

    setIsLoginLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername }),
      });
      const data = await response.json();
      if (data.userId) {
        const user = { id: data.userId, username: data.username };
        setCurrentUser(user);
        localStorage.setItem('omnimind-user', JSON.stringify(user));
        loadSessions(data.userId);
      }
    } catch (e) {
      console.error('Login failed', e);
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('omnimind-user');
    setCurrentUser(null);
    setSessions([]);
    setActiveSessionId('');
    setMessages([]);
  };

  // Save sessions to localStorage
  useEffect(() => {
    if (currentUser && sessions.length > 0) {
      localStorage.setItem(`omnimind-sessions-${currentUser.id}`, JSON.stringify(sessions));
    }
  }, [sessions, currentUser]);

  const createNewSession = async (userId?: string) => {
    const uid = userId || currentUser?.id;
    if (!uid) return;

    const newId = Math.random().toString(36).substring(2, 11);
    const newSession: Session = {
      id: newId,
      title: '新对话',
      updatedAt: Date.now()
    };

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${apiUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, sessionId: newId, title: '新对话' }),
      });

      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newId);
      setMessages([]);
      setIsSidebarOpen(false);
    } catch (e) {
      console.error('Failed to create session on server', e);
    }
  };

  const deleteSession = async (id: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    if (!confirm('确定要删除此对话及其所有记忆吗？')) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      await fetch(`${apiUrl}/chat/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id, userId: currentUser.id }),
      });

      const updated = sessions.filter(s => s.id !== id);
      setSessions(updated);
      if (activeSessionId === id && updated.length > 0) {
        setActiveSessionId(updated[0].id);
      } else if (updated.length === 0) {
        createNewSession();
      }
    } catch (e) {
      console.error('Failed to delete session', e);
    }
  };

  const fetchHistory = async (sid: string) => {
    if (!sid || !currentUser) return;
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/history/${sid}?userId=${currentUser.id}`);
      if (!response.ok) return;
      const data = await response.json();

      const formattedMessages: Message[] = data.map((m: any) => ({
        role: m.role,
        content: m.content || '',
        thought: m.thought || m.reasoning_content || '',
        isStreaming: false,
        isThoughtExpanded: !!(m.thought || m.reasoning_content)
      }));

      setMessages(formattedMessages);
      // Synchronize showThought for any component still using the old state map
      const initialShowState: Record<number, boolean> = {};
      formattedMessages.forEach((m, idx) => {
        if (m.thought) initialShowState[idx] = true;
      });
      setShowThought(initialShowState);
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  useEffect(() => {
    if (activeSessionId) fetchHistory(activeSessionId);
  }, [activeSessionId]);

  const handleResetCurrent = async () => {
    if (!currentUser) return;
    if (!confirm('确定要清空此对话的所有记忆吗？')) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/chat/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, userId: currentUser.id }),
      });

      if (response.ok) {
        setMessages([]);
        setInput('');
        setImage(null);
      }
    } catch (e) {
      console.error('Failed to reset chat', e);
    }
  };

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
    setMessages(prev => prev.map((m, i) =>
      i === index ? { ...m, isThoughtExpanded: !m.isThoughtExpanded } : m
    ));
    // Also update the legacy map for consistency
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          image: currentImage,
          sessionId: activeSessionId,
          userId: currentUser?.id,
          reasoning: isReasoningEnabled
        }),
      });

      if (!response.ok) throw new Error('发送失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let assistantMsg = '';
      let assistantThought = '';
      let assistantStatus = '';

      setMessages((prev) => {
        const nextIdx = prev.length;
        setShowThought(st => ({ ...st, [nextIdx]: true }));
        return [...prev, { role: 'assistant', content: '', thought: '', status: '', isStreaming: true, isThoughtExpanded: true }];
      });
      setIsLoading(false);

      let currentMode: 't' | 'c' | 's' | 'u' | null = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process the buffer
        // Prefixes are t:, c:, s:, u:
        while (buffer.length > 0) {
          // Check if we have a prefix at the start of the buffer
          const prefixMatch = buffer.match(/^([tcsu]):/);
          if (prefixMatch) {
            currentMode = prefixMatch[1] as 't' | 'c' | 's' | 'u';
            buffer = buffer.slice(2);
            // Clear the status when a new status prefix arrives
            if (currentMode === 's') assistantStatus = '';
            continue;
          }

          // If we don't have a prefix at the start, we look for the next prefix
          const nextPrefixIndex = buffer.search(/[tcsu]:/);
          let content = '';

          if (nextPrefixIndex === -1) {
            // No more prefixes in this buffer, all remaining is content for currentMode
            // But wait, if the buffer ends with a partial prefix (e.g. "t"), we should keep it
            const partialMatch = buffer.match(/[tcsu]$/);
            if (partialMatch) {
              const keep = buffer.length - 1;
              content = buffer.slice(0, keep);
              buffer = buffer.slice(keep);
            } else {
              content = buffer;
              buffer = '';
            }
          } else {
            // Found a prefix later in the buffer
            content = buffer.slice(0, nextPrefixIndex);
            buffer = buffer.slice(nextPrefixIndex);
          }

          if (content) {
            if (currentMode === 't') assistantThought += content;
            else if (currentMode === 'c') assistantMsg += content;
            else if (currentMode === 's') assistantStatus += content;
            else if (currentMode === 'u') {
              const newTitle = content.trim();
              if (newTitle) {
                setSessions(prev => prev.map(s =>
                  s.id === activeSessionId ? { ...s, title: newTitle, updatedAt: Date.now() } : s
                ));
              }
            }
          }

          // Trigger update
          setMessages((prev) => {
            const newMessages = [...prev];
            const assistantMessageIndex = newMessages.length - 1; // Assuming the last message is the assistant's
            if (assistantMessageIndex >= 0 && newMessages[assistantMessageIndex].role === 'assistant') {
              const msg = { ...newMessages[assistantMessageIndex] };
              msg.content = assistantMsg;
              msg.thought = assistantThought;
              msg.status = assistantStatus;
              msg.isThoughtExpanded = msg.isThoughtExpanded ?? true; // Maintain expanded state
              newMessages[assistantMessageIndex] = msg;
            }
            return newMessages;
          });

          // If we just processed content and the buffer is empty, we're done with this chunk
          if (buffer === '' || /^[tcsu]$/.test(buffer)) break;
        }
      }

      setMessages((prev) => {
        const newMsgs = [...prev];
        const lastIdx = newMsgs.length - 1;
        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          newMsgs[lastIdx] = {
            ...newMsgs[lastIdx],
            status: '',
            isStreaming: false,
            content: assistantMsg,
            thought: assistantThought
          };
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
    <div className="flex h-screen bg-slate-50 font-sans antialiased text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed lg:relative z-50 w-72 h-full bg-white/80 backdrop-blur-2xl border-r border-slate-100 flex flex-col"
          >
            <div className="p-6">
              <button
                onClick={() => createNewSession()}
                className="w-full h-12 flex items-center justify-center gap-2 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200"
              >
                <Plus className="w-4 h-4" />
                <span>开启新意图</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => { setActiveSessionId(s.id); setIsSidebarOpen(false); }}
                  className={cn(
                    "group w-full p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between",
                    activeSessionId === s.id ? "bg-blue-50 text-blue-600 border border-blue-100 shadow-sm" : "hover:bg-slate-50 text-slate-500"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", activeSessionId === s.id ? "bg-blue-500" : "bg-slate-200")} />
                    <span className="text-sm font-bold truncate">{s.title}</span>
                  </div>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-100 mt-auto space-y-4">
              <button
                onClick={handleLogout}
                className="w-full py-2 text-xs text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center gap-2"
              >
                退出登录
              </button>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                  {currentUser?.username.slice(0, 1).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Neural User</p>
                  <p className="text-xs font-bold truncate">{currentUser?.username}</p>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-white relative">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
        )}

        <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white/60 backdrop-blur-3xl sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-all text-slate-400">
              <PanelLeft className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500 mb-0.5">OmniMind</span>
            <h1 className="text-lg font-black tracking-tight">神经中枢</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetCurrent}
              className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-all text-slate-400"
              title="清空对话记忆"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button onClick={() => setIsDrawerOpen(true)} className="w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-2xl transition-all text-slate-400">
              <Layers className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 移除全局 scroll-smooth，避免与 JS 滚动冲突 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8 custom-scrollbar bg-[radial-gradient(#f1f5f9_1px,transparent_1px)] [background-size:20px_20px] max-w-full">
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

                  {(msg.thought || msg.status) && (
                    <div className="w-full space-y-2">
                      {msg.thought && (
                        <button
                          onClick={() => toggleThought(i)}
                          className="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-blue-500 uppercase tracking-widest px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-all group"
                        >
                          <div className={cn("w-1.5 h-1.5 rounded-full transition-colors",
                            msg.isStreaming && msg.content === '' ? "bg-blue-500 animate-ping" :
                              (msg.isThoughtExpanded ?? showThought[i]) ? "bg-blue-500" : "bg-slate-300"
                          )} />
                          <span>思考过程</span>
                          {(msg.isThoughtExpanded ?? showThought[i]) ?
                            <ChevronUp className="w-3 h-3 transition-transform group-hover:-translate-y-0.5" /> :
                            <ChevronDown className="w-3 h-3 transition-transform group-hover:translate-y-0.5" />
                          }
                        </button>
                      )}
                      {msg.thought && (msg.isThoughtExpanded ?? showThought[i]) && (
                        <div className="relative bg-slate-50/80 rounded-3xl px-5 py-4 text-[13px] text-slate-500 leading-relaxed border border-slate-200/50">
                          <NeuralPulse />
                          <div className="relative z-10 whitespace-pre-wrap font-mono prose prose-slate prose-xs max-w-none prose-p:my-1">
                            {msg.thought}
                          </div>
                        </div>
                      )}
                      {msg.status && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className="flex items-center gap-3 px-5 py-3 bg-white/50 backdrop-blur-md rounded-2xl border border-slate-100 shadow-sm text-[12px] text-slate-600 font-medium group transition-all hover:border-blue-200"
                        >
                          <div className="relative flex items-center justify-center">
                            <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-md animate-pulse" />
                            {msg.status.includes('🔍') ? <Search className="w-3.5 h-3.5 text-blue-500 relative z-10" /> :
                              msg.status.includes('🛠️') ? <Wrench className="w-3.5 h-3.5 text-amber-500 relative z-10 animate-spin-slow" /> :
                                msg.status.includes('🧠') ? <Brain className="w-3.5 h-3.5 text-indigo-500 relative z-10 animate-pulse" /> :
                                  <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin relative z-10" />}
                          </div>
                          <span className="truncate">{msg.status.replace(/[🔍🛠️🧠]/g, '').trim()}</span>
                          <div className="flex gap-0.5 ml-auto">
                            <span className="w-0.5 h-0.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-0.5 h-0.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                            <span className="w-0.5 h-0.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '400ms' }} />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* 
                  关键点：在流式输出时禁用 layout 属性。
                  只有在静态显示（非输出中）时才启用平滑动画。
                */}
                  {/* Only show the content bubble if there is content, OR if it's a user message, OR if it's currently streaming with content */}
                  {(msg.content || msg.role === 'user' || (msg.isStreaming && msg.content !== '')) && (
                    <motion.div
                      layout={msg.isStreaming ? false : "position"}
                      initial={msg.isStreaming ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", damping: 30, stiffness: 200 }}
                      className={cn(
                        "rounded-[1.8rem] px-6 py-3.5 text-[15px] shadow-sm leading-[1.6] relative max-w-full overflow-hidden",
                        msg.role === 'user'
                          ? "bg-blue-600 text-white rounded-tr-none font-medium shadow-blue-50"
                          : "bg-white text-slate-800 border border-slate-100 rounded-tl-none"
                      )}>
                      {msg.role === 'assistant' ? (
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        msg.content
                      )}
                      {msg.isStreaming && msg.content === '' && !msg.thought && !msg.status && (
                        <div className="flex gap-1.5 py-1">
                          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-200 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      )}
                    </motion.div>
                  )}
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

        <MemoryDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} sessionId={activeSessionId} userId={currentUser?.id || ''} />

        <AnimatePresence>
          {!currentUser && mounted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white flex items-center justify-center p-6"
            >
              <NeuralBackground />

              <motion.div
                initial={{ scale: 0.95, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 25, stiffness: 150, delay: 0.1 }}
                className="w-full max-w-[400px] bg-white rounded-[2.5rem] p-10 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-slate-100"
              >
                <div className="text-center mb-10 relative">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center shadow-xl mx-auto mb-6"
                  >
                    <Bot className="w-10 h-10 text-blue-400" />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 mb-2">
                      欢迎进入 OmniMind
                    </h2>
                    <p className="text-slate-400 text-sm font-medium">
                      请输入神经通行证名称以同步记忆
                    </p>
                  </motion.div>
                </div>

                <form onSubmit={handleLogin} className="space-y-8 relative">
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">身份标识符</label>
                      <div className="flex gap-1">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1 h-1 bg-blue-500/20 rounded-full" />
                        ))}
                      </div>
                    </div>
                    <div className="relative group">
                      <input
                        required
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="请输入通行证名称..."
                        className="w-full h-16 px-8 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-blue-500/10 focus:bg-white focus:ring-4 focus:ring-blue-500/5 transition-all outline-none text-lg font-bold text-slate-900 placeholder:text-slate-300 shadow-inner"
                        autoFocus
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <div className="h-4 w-[1px] bg-slate-200" />
                        <User className="w-5 h-5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    disabled={isLoginLoading}
                    className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoginLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>确认接入</span>
                        <Send className="w-4 h-4 opacity-50" />
                      </>
                    )}
                  </motion.button>
                </form>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-12 text-center"
                >
                  <p className="text-[10px] text-slate-300 font-black tracking-[0.2em] uppercase">
                    Neural Bridge Protocol v2.5.0
                  </p>
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .markdown-content { font-size: 15px; }
        .markdown-content p { margin-bottom: 0.75rem; }
        .markdown-content strong, .markdown-content b { font-weight: 700; }
        .markdown-content em, .markdown-content i { font-style: italic; }
        .markdown-content p:last-child { margin-bottom: 0; }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 { font-weight: 800; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .markdown-content h1 { font-size: 1.25rem; }
        .markdown-content h2 { font-size: 1.1rem; }
        .markdown-content h3 { font-size: 1rem; }
        .markdown-content ul, .markdown-content ol { margin-left: 1.25rem; margin-bottom: 0.75rem; }
        .markdown-content li { margin-bottom: 0.25rem; }
        .markdown-content code { background: #f1f5f9; padding: 0.1rem 0.3rem; border-radius: 0.3rem; font-family: monospace; font-size: 0.9em; }
        .markdown-content pre { background: #f8fafc; padding: 1rem; border-radius: 1rem; overflow-x: auto; margin-bottom: 0.75rem; border: 1px solid #e2e8f0; }
        .markdown-content pre code { background: transparent; padding: 0; }
        .markdown-content blockquote { border-left: 4px solid #e2e8f0; padding-left: 1rem; font-style: italic; color: #64748b; margin-bottom: 0.75rem; }
        .markdown-content table { width: 100%; border-collapse: collapse; margin-bottom: 0.75rem; }
        .markdown-content th, .markdown-content td { border: 1px solid #e2e8f0; padding: 0.5rem; text-align: left; }
        .markdown-content th { background: #f8fafc; }
      `}</style>
      </div>
    </div>
  );
}
