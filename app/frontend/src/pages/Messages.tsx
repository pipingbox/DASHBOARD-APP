import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Loader2,
  ArrowLeft,
  Calendar,
  FileText,
  Clock,
  User,
  Check,
  CheckCheck,
} from 'lucide-react';
import { supabase, TABLES } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Conversation {
  id: string;
  company_user_id: string;
  worker_user_id: string;
  application_id: string | null;
  job_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_company: number;
  unread_worker: number;
  created_at: string;
  // Joined fields
  other_name?: string;
  other_avatar?: string;
  job_title?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  receiver_user_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

type QuickAction = 'interview' | 'documents' | 'availability';

const QUICK_ACTIONS: { key: QuickAction; label: string; icon: typeof Calendar; message: string }[] = [
  {
    key: 'interview',
    label: 'Invite to Interview',
    icon: Calendar,
    message: '📅 We would like to invite you for an interview. Please let us know your available times.',
  },
  {
    key: 'documents',
    label: 'Request Documents',
    icon: FileText,
    message: '📄 Could you please send us the following documents: updated CV, certifications, and references.',
  },
  {
    key: 'availability',
    label: 'Request Availability',
    icon: Clock,
    message: '🕐 Could you share your availability for the upcoming weeks? We would like to schedule you.',
  },
];

export default function Messages() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const userRole = profile?.role || 'worker';
  const isCompany = userRole === 'company' || userRole === 'admin';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const col = isCompany ? 'company_user_id' : 'worker_user_id';
      const { data, error } = await supabase
        .from(TABLES.conversations)
        .select('*')
        .eq(col, user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Enrich with other user's profile
      const enriched: Conversation[] = [];
      for (const conv of data || []) {
        const otherId = isCompany ? conv.worker_user_id : conv.company_user_id;
        const { data: otherProfile } = await supabase
          .from(TABLES.profiles)
          .select('full_name, username, avatar_url')
          .eq('user_id', otherId)
          .single();

        let jobTitle: string | undefined;
        if (conv.job_id) {
          const { data: job } = await supabase
            .from(TABLES.jobs)
            .select('title')
            .eq('id', conv.job_id)
            .single();
          jobTitle = job?.title;
        }

        enriched.push({
          ...conv,
          other_name: otherProfile?.full_name || otherProfile?.username || 'Unknown',
          other_avatar: otherProfile?.avatar_url,
          job_title: jobTitle,
        });
      }

      setConversations(enriched);

      // Auto-select conversation from URL params
      const convId = searchParams.get('conversation');
      if (convId) {
        const found = enriched.find((c) => c.id === convId);
        if (found) {
          setSelectedConversation(found);
          setMobileShowChat(true);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isCompany, searchParams]);

  // Fetch messages for selected conversation
  const fetchMessages = useCallback(async () => {
    if (!selectedConversation) return;
    try {
      const { data, error } = await supabase
        .from(TABLES.messages)
        .select('*')
        .eq('conversation_id', selectedConversation.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Mark messages as read
      const unreadCol = isCompany ? 'unread_company' : 'unread_worker';
      await supabase
        .from(TABLES.conversations)
        .update({ [unreadCol]: 0 })
        .eq('id', selectedConversation.id);

      // Mark individual messages as read
      await supabase
        .from(TABLES.messages)
        .update({ read: true })
        .eq('conversation_id', selectedConversation.id)
        .eq('receiver_user_id', user?.id)
        .eq('read', false);

      setTimeout(scrollToBottom, 100);
    } catch (err: unknown) {
      console.error('Failed to fetch messages:', err);
    }
  }, [selectedConversation, user, isCompany, scrollToBottom]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Send message
  const handleSend = async (text?: string) => {
    const messageText = text || newMessage.trim();
    if (!messageText || !selectedConversation || !user) return;

    setSending(true);
    try {
      const receiverId = isCompany
        ? selectedConversation.worker_user_id
        : selectedConversation.company_user_id;

      const { error: msgError } = await supabase.from(TABLES.messages).insert({
        conversation_id: selectedConversation.id,
        sender_user_id: user.id,
        receiver_user_id: receiverId,
        application_id: selectedConversation.application_id,
        job_id: selectedConversation.job_id,
        company_user_id: selectedConversation.company_user_id,
        worker_user_id: selectedConversation.worker_user_id,
        message: messageText,
        read: false,
      });

      if (msgError) throw msgError;

      // Update conversation
      const unreadCol = isCompany ? 'unread_worker' : 'unread_company';
      const { data: convData } = await supabase
        .from(TABLES.conversations)
        .select(unreadCol)
        .eq('id', selectedConversation.id)
        .single();

      await supabase
        .from(TABLES.conversations)
        .update({
          last_message: messageText.substring(0, 100),
          last_message_at: new Date().toISOString(),
          [unreadCol]: ((convData as Record<string, number>)?.[unreadCol] || 0) + 1,
        })
        .eq('id', selectedConversation.id);

      setNewMessage('');
      await fetchMessages();
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleQuickAction = (action: QuickAction) => {
    const qa = QUICK_ACTIONS.find((a) => a.key === action);
    if (qa) {
      handleSend(qa.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectConversation = (conv: Conversation) => {
    setSelectedConversation(conv);
    setMobileShowChat(true);
    setSearchParams({ conversation: conv.id });
  };

  const handleBack = () => {
    setMobileShowChat(false);
    setSelectedConversation(null);
    setSearchParams({});
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const totalUnread = conversations.reduce((sum, c) => {
    return sum + (isCompany ? c.unread_company : c.unread_worker);
  }, 0);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6">
        <MessageSquare className="h-5 w-5 text-amber-500" />
        <h1 className="text-lg font-semibold">Messages</h1>
        {totalUnread > 0 && (
          <Badge className="bg-amber-600 text-black text-xs">{totalUnread}</Badge>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversation List */}
        <div
          className={cn(
            'w-full border-r border-zinc-800 sm:w-80 lg:w-96 flex-shrink-0 overflow-y-auto',
            mobileShowChat && 'hidden sm:block'
          )}
        >
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 px-6 text-center">
              <MessageSquare className="h-12 w-12 mb-3 text-zinc-700" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1 text-zinc-600">
                {isCompany
                  ? 'Message candidates from their profile page'
                  : 'Companies will contact you when interested'}
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const unread = isCompany ? conv.unread_company : conv.unread_worker;
              const isSelected = selectedConversation?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-zinc-800/50 transition hover:bg-zinc-800/50',
                    isSelected && 'bg-zinc-800/70'
                  )}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-zinc-300">
                    {conv.other_avatar ? (
                      <img
                        src={conv.other_avatar}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-zinc-100 truncate">
                        {conv.other_name}
                      </span>
                      {conv.last_message_at && (
                        <span className="text-[10px] text-zinc-500 flex-shrink-0 ml-2">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    {conv.job_title && (
                      <p className="text-[10px] text-amber-500/80 truncate">{conv.job_title}</p>
                    )}
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-zinc-500 truncate">
                        {conv.last_message || 'No messages yet'}
                      </p>
                      {unread > 0 && (
                        <Badge className="bg-amber-600 text-black text-[10px] h-5 min-w-[20px] flex-shrink-0 ml-2">
                          {unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Chat Area */}
        <div
          className={cn(
            'flex-1 flex flex-col',
            !mobileShowChat && 'hidden sm:flex'
          )}
        >
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
                <button
                  onClick={handleBack}
                  className="sm:hidden text-zinc-400 hover:text-zinc-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-300">
                  {selectedConversation.other_avatar ? (
                    <img
                      src={selectedConversation.other_avatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">
                    {selectedConversation.other_name}
                  </p>
                  {selectedConversation.job_title && (
                    <p className="text-[10px] text-zinc-500 truncate">
                      Re: {selectedConversation.job_title}
                    </p>
                  )}
                </div>
              </div>

              {/* Quick Actions (Company only) */}
              {isCompany && (
                <div className="flex gap-2 px-4 py-2 border-b border-zinc-800/50 overflow-x-auto">
                  {QUICK_ACTIONS.map((action) => (
                    <Button
                      key={action.key}
                      variant="outline"
                      size="sm"
                      onClick={() => handleQuickAction(action.key)}
                      className="text-[10px] h-7 border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-amber-600/50 whitespace-nowrap flex-shrink-0"
                    >
                      <action.icon className="h-3 w-3 mr-1" />
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                    Start the conversation...
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_user_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex', isMine ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[75%] rounded-lg px-3 py-2',
                            isMine
                              ? 'bg-amber-600/20 border border-amber-600/30 text-zinc-100'
                              : 'bg-zinc-800 border border-zinc-700 text-zinc-200'
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                          <div
                            className={cn(
                              'flex items-center gap-1 mt-1',
                              isMine ? 'justify-end' : 'justify-start'
                            )}
                          >
                            <span
                              className={cn(
                                'text-[10px]',
                                isMine ? 'text-amber-500/60' : 'text-zinc-600'
                              )}
                            >
                              {formatTime(msg.created_at)}
                            </span>
                            {isMine && (
                              msg.read ? (
                                <CheckCheck className="h-3 w-3 text-amber-400" />
                              ) : (
                                <Check className="h-3 w-3 text-zinc-500" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-zinc-800 px-4 py-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-600/50 focus:outline-none focus:ring-1 focus:ring-amber-600/30"
                  />
                  <Button
                    onClick={() => handleSend()}
                    disabled={!newMessage.trim() || sending}
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-500 text-black h-9 w-9 p-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <MessageSquare className="h-16 w-16 mb-4 text-zinc-800" />
              <p className="text-sm">Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}