'use client';
import { useState, useRef, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  agent: { slug: string; name: string; color: string; emoji: string; role: string };
  socket: Socket | null;
}

export default function ChatPanel({ agent, socket }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    socket.on('message_response', (data: any) => {
      if (data.response) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        }]);
      }
      setIsLoading(false);
    });

    socket.on('error', () => setIsLoading(false));

    return () => {
      socket.off('message_response');
      socket.off('error');
    };
  }, [socket]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    const text = input;
    setInput('');

    if (socket?.connected) {
      socket.emit('send_message', { text, from: 'web_user', agentSlug: agent.slug });
    } else {
      // Fallback to REST
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/agents/${agent.slug}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, from: 'web_user' })
        });
        const data = await res.json();
        if (data.response) {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: data.response,
            timestamp: new Date()
          }]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10 glass">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl border-2"
          style={{ borderColor: agent.color, boxShadow: `0 0 16px ${agent.color}60` }}
        >
          {agent.emoji}
        </div>
        <div>
          <h2 className="font-bold text-white">{agent.name}</h2>
          <p className="text-xs text-white/40">{agent.role}</p>
        </div>
        <div className="ml-auto">
          {isLoading && (
            <div className="flex gap-1 items-center text-xs text-white/40">
              <div className="flex gap-0.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span>escribiendo...</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="text-5xl">{agent.emoji}</div>
            <p className="text-white/60 font-medium">Hola, soy {agent.name}</p>
            <p className="text-white/30 text-sm max-w-xs">{agent.role} — ¿en qué te puedo ayudar?</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
            {msg.role === 'assistant' && (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm mr-2 flex-shrink-0 self-end"
                style={{ borderColor: agent.color, border: `1.5px solid ${agent.color}` }}
              >
                {agent.emoji}
              </div>
            )}
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-white/10 text-white rounded-br-none'
                  : 'glass text-white/90 rounded-bl-none'
              }`}
              style={msg.role === 'assistant' ? { borderColor: `${agent.color}30` } : {}}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-white/30 text-right' : 'text-white/20'}`}>
                {msg.timestamp.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 glass">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`Escríbele a ${agent.name}...`}
            rows={1}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none resize-none max-h-32 focus:border-white/20 transition-colors"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: agent.color }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
