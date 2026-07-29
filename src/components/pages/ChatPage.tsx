import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLauncherStore } from "../../stores";
import { GlassCard } from "../ui/GlassCard";
import { GlowButton } from "../ui/GlowButton";
import { GlassInput } from "../ui/FormControls";
import {
  MessageSquare, Send, LogOut, Upload, UserPlus, Users,
  Circle, Clock, Swords, ChevronDown, X,
} from "lucide-react";
import {
  auth,
  onAuthStateChanged,
  updateProfile,
} from "../../lib/firebase";
import {
  registerUser,
  loginUser,
  logoutUser,
  uploadProfileImage,
  sendMessage,
  subscribeToMessages,
  subscribeToOnlineUsers,
  setupPresence,
  sendInvite,
} from "../../lib/chatService";
import type { ChatUser, ChatMessage } from "../../lib/chatService";

const STEVE_HEAD = "https://mc-heads.net/avatar/Steve/64";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function ChatPage() {
  const { themeColors } = useLauncherStore();

  const [user, setUser] = useState<ChatUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth form
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<ChatUser[]>([]);
  const [inputText, setInputText] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteAddress, setInviteAddress] = useState("");
  const [invitePort, setInvitePort] = useState("25565");
  const [inviteVersion, setInviteVersion] = useState("1.20.4");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unsubMessagesRef = useRef<(() => void) | null>(null);
  const unsubUsersRef = useRef<(() => void) | null>(null);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        // Fetch full profile from database
        const { get, ref: dbRef, db } = await import("../../lib/firebase");
        try {
          const snap = await get(dbRef(db, `users/${fbUser.uid}`));
          if (snap.exists()) {
            setUser(snap.val());
          } else {
            // Create basic profile
            const profile: ChatUser = {
              uid: fbUser.uid,
              username: fbUser.displayName || "Unknown",
              email: fbUser.email || "",
              displayName: fbUser.displayName || "Unknown",
              photoURL: fbUser.photoURL || STEVE_HEAD,
              status: "online",
              lastSeen: Date.now(),
              createdAt: Date.now(),
            };
            const { set: dbSet } = await import("../../lib/firebase");
            await dbSet(dbRef(db, `users/${fbUser.uid}`), profile);
            setUser(profile);
          }
          setupPresence();
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
        if (unsubMessagesRef.current) {
          unsubMessagesRef.current();
          unsubMessagesRef.current = null;
        }
        if (unsubUsersRef.current) {
          unsubUsersRef.current();
          unsubUsersRef.current = null;
        }
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Subscribe to messages and users when logged in
  useEffect(() => {
    if (!user) return;

    unsubMessagesRef.current = subscribeToMessages(setMessages);
    unsubUsersRef.current = subscribeToOnlineUsers(setOnlineUsers);

    return () => {
      if (unsubMessagesRef.current) unsubMessagesRef.current();
      if (unsubUsersRef.current) unsubUsersRef.current();
    };
  }, [user]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auth handlers
  const handleAuth = async () => {
    setAuthError("");
    setAuthLoading(true);

    if (isRegister) {
      if (!username.trim()) {
        setAuthError("Username is required");
        setAuthLoading(false);
        return;
      }
      if (username.length < 3 || username.length > 20) {
        setAuthError("Username must be 3-20 characters");
        setAuthLoading(false);
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        setAuthError("Username: letters, numbers, underscores only");
        setAuthLoading(false);
        return;
      }
      const result = await registerUser(email, password, username);
      if (!result.success) {
        setAuthError(result.error || "Registration failed");
      }
    } else {
      const result = await loginUser(email, password);
      if (!result.success) {
        setAuthError(result.error || "Login failed");
      }
    }

    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setMessages([]);
    setOnlineUsers([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    // Check for /invite command
    if (text.startsWith("/invite ")) {
      const parts = text.slice(8).split(" ");
      if (parts.length >= 1) {
        setInviteUsername(parts[0]);
        if (parts[1]) setInviteAddress(parts[1]);
        if (parts[2]) setInvitePort(parts[2]);
        if (parts[3]) setInviteVersion(parts[3]);
        setShowInvite(true);
        setInputText("");
        return;
      }
    }

    setSending(true);
    setSendError("");
    try {
      await sendMessage(text);
      setInputText("");
      inputRef.current?.focus();
    } catch (err: any) {
      setSendError(err?.message || "Failed to send. Check Firebase Database rules.");
    }
    setSending(false);
  };

  const handleSendInvite = async () => {
    if (!inviteUsername.trim() || !inviteAddress.trim()) return;
    setSending(true);
    try {
      const result = await sendInvite(
        inviteUsername.trim(),
        inviteAddress.trim(),
        parseInt(invitePort, 10) || 25565,
        inviteVersion || "1.20.4"
      );
      if (!result.success) {
        await sendMessage(`Failed to send invite: ${result.error}`, "system");
      }
      setShowInvite(false);
      setInviteUsername("");
      setInviteAddress("");
      setInvitePort("25565");
      setInviteVersion("1.20.4");
    } catch {
      // silent
    }
    setSending(false);
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const result = await uploadProfileImage(file);
    if (result.success && result.url && user) {
      setUser({ ...user, photoURL: result.url });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const currentUser = user as ChatUser;

  // ── Login / Register Screen ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 rounded-full mx-auto mb-3"
            style={{
              border: `2px solid ${themeColors.border}`,
              borderTopColor: themeColors.accent,
            }}
          />
          <p className="tinycaps text-xs" style={{ color: themeColors.text_muted }}>
            Loading chat...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarUpload}
        />
        <GlassCard className="w-full max-w-sm p-6">
          <div className="text-center mb-6">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${themeColors.accent}25, ${themeColors.purple || themeColors.blue}20)`,
                border: `1px solid ${themeColors.accent}30`,
              }}
            >
              <MessageSquare size={28} style={{ color: themeColors.accent }} />
            </div>
            <h2
              className="tinycaps text-lg font-bold gradient-text"
              style={
                {
                  "--accent": themeColors.accent,
                  "--accent2": themeColors.purple || themeColors.blue,
                } as any
              }
            >
              EC Chat
            </h2>
            <p className="text-xs mt-1" style={{ color: themeColors.text_muted }}>
              {isRegister ? "Create an account to join the chat" : "Sign in to chat with other players"}
            </p>
          </div>

          <div className="space-y-3">
            {isRegister && (
              <div>
                <label className="text-[10px] font-medium mb-1 block tinycaps" style={{ color: themeColors.text_sub }}>
                  Username
                </label>
                <GlassInput
                  value={username}
                  onChange={setUsername}
                  onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                  placeholder="Your display name"
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-medium mb-1 block tinycaps" style={{ color: themeColors.text_sub }}>
                Email
              </label>
              <GlassInput
                value={email}
                onChange={setEmail}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                placeholder="you@example.com"
                type="email"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium mb-1 block tinycaps" style={{ color: themeColors.text_sub }}>
                Password
              </label>
              <GlassInput
                value={password}
                onChange={setPassword}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                placeholder="••••••••"
                type="password"
              />
            </div>

            {authError && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[11px] px-3 py-2 rounded-xl"
                style={{
                  background: `${themeColors.danger}15`,
                  color: themeColors.danger,
                  border: `1px solid ${themeColors.danger}30`,
                }}
              >
                {authError}
              </motion.p>
            )}

            <GlowButton
              fullWidth
              onClick={handleAuth}
              disabled={authLoading}
            >
              {authLoading
                ? "Please wait..."
                : isRegister
                  ? "Create Account"
                  : "Sign In"}
            </GlowButton>

            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setAuthError("");
              }}
              className="w-full text-center text-[11px] tinycaps font-medium cursor-pointer py-1"
              style={{ color: themeColors.text_sub, background: "none", border: "none" }}
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Don't have an account? Register"}
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ── Chat Interface ──
  const onlineCount = onlineUsers.filter((u) => u.status === "online").length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* Top Bar */}
      <GlassCard className="shrink-0 flex items-center justify-between px-4 py-2.5 rounded-xl mb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} style={{ color: themeColors.accent }} />
            <h1
              className="tinycaps text-base font-bold gradient-text"
              style={
                {
                  "--accent": themeColors.accent,
                  "--accent2": themeColors.purple || themeColors.blue,
                } as any
              }
            >
              Chat
            </h1>
          </div>
          <div
            className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-lg"
            style={{
              background: `${themeColors.success}12`,
              color: themeColors.success,
              border: `1px solid ${themeColors.success}25`,
            }}
          >
            <Circle size={6} fill={themeColors.success} />
            {onlineCount} online
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleAvatarClick}
              className="relative cursor-pointer"
              title="Change avatar"
            >
              <img
                src={currentUser.photoURL || STEVE_HEAD}
                alt=""
                className="w-7 h-7 rounded-lg object-cover"
                style={{ border: `2px solid ${themeColors.accent}40` }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = STEVE_HEAD;
                }}
              />
              <div
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center"
                style={{
                  background: themeColors.bg_card,
                  border: `1.5px solid ${themeColors.success}`,
                }}
              >
                <Upload size={6} style={{ color: themeColors.success }} />
              </div>
            </motion.button>
            <span
              className="tinycaps text-[11px] font-bold"
              style={{ color: themeColors.text_main }}
            >
              {currentUser.username}
            </span>
          </div>

          <GlowButton size="sm" variant="secondary" onClick={handleLogout} className="flex items-center gap-1">
            <LogOut size={11} /> Logout
          </GlowButton>
        </div>
      </GlassCard>

      {/* Main Chat Area */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Messages Column */}
        <div className="flex-1 flex flex-col min-w-0">
          <GlassCard className="flex-1 flex flex-col min-h-0 rounded-xl p-0 overflow-hidden">
            {/* Message Feed */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-60">
                  <MessageSquare
                    size={32}
                    style={{ color: themeColors.text_muted }}
                  />
                  <p
                    className="text-xs mt-2 tinycaps"
                    style={{ color: themeColors.text_muted }}
                  >
                    No messages yet. Say hello!
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      isOwn={msg.uid === currentUser.uid}
                      themeColors={themeColors}
                    />
                  ))}
                </AnimatePresence>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            {sendError && (
              <div className="px-4 py-1.5" style={{ background: `${themeColors.danger}15`, borderBottom: `1px solid ${themeColors.danger}30` }}>
                <p className="text-[10px] font-medium" style={{ color: themeColors.danger }}>
                  {sendError}
                </p>
              </div>
            )}
            <div
              className="px-4 py-3 flex items-center gap-2 shrink-0"
              style={{ borderTop: `1px solid ${themeColors.border}` }}
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowInvite(true)}
                className="p-2 rounded-xl transition-colors shrink-0 cursor-pointer"
                style={{
                  background: `${themeColors.blue}15`,
                  color: themeColors.blue,
                  border: `1px solid ${themeColors.blue}25`,
                }}
                title="Invite player to server"
              >
                <UserPlus size={14} />
              </motion.button>

              <GlassInput
                ref={inputRef}
                value={inputText}
                onChange={setInputText}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (or /invite username)"
                disabled={sending}
                className="flex-1"
              />

              <GlowButton
                size="sm"
                onClick={handleSend}
                disabled={!inputText.trim() || sending}
                className="flex items-center gap-1 shrink-0"
              >
                <Send size={12} />
              </GlowButton>
            </div>
          </GlassCard>
        </div>

        {/* Online Users Sidebar */}
        <div className="w-52 shrink-0">
          <GlassCard className="h-full rounded-xl p-0 overflow-hidden flex flex-col">
            <div
              className="px-3 py-2.5 flex items-center gap-1.5 shrink-0"
              style={{ borderBottom: `1px solid ${themeColors.border}` }}
            >
              <Users size={13} style={{ color: themeColors.accent }} />
              <span
                className="tinycaps text-[11px] font-bold"
                style={{ color: themeColors.text_main }}
              >
                Online
              </span>
              <span
                className="text-[9px] ml-auto"
                style={{ color: themeColors.text_muted }}
              >
                {onlineUsers.length}
              </span>
            </div>

            <div
              className="flex-1 overflow-y-auto py-1.5"
              style={{ scrollbarWidth: "thin" }}
            >
              {onlineUsers.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Users
                    size={18}
                    className="mx-auto mb-1"
                    style={{ color: themeColors.text_muted, opacity: 0.4 }}
                  />
                  <p
                    className="text-[10px]"
                    style={{ color: themeColors.text_muted }}
                  >
                    No users online
                  </p>
                </div>
              ) : (
                onlineUsers.map((u) => (
                  <motion.div
                    key={u.uid}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="px-2.5 py-1.5 flex items-center gap-2 mx-1 rounded-lg transition-colors"
                    style={{
                      background:
                        u.uid === currentUser.uid
                          ? `${themeColors.accent}12`
                          : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (u.uid !== currentUser.uid)
                        e.currentTarget.style.background = `${themeColors.bg_hover}`;
                    }}
                    onMouseLeave={(e) => {
                      if (u.uid !== currentUser.uid)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={u.photoURL || STEVE_HEAD}
                        alt=""
                        className="w-6 h-6 rounded-md object-cover"
                        style={{
                          border: `1.5px solid ${
                            u.status === "online"
                              ? themeColors.success
                              : themeColors.text_muted
                          }40`,
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = STEVE_HEAD;
                        }}
                      />
                      <div
                        className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                        style={{
                          background:
                            u.status === "online"
                              ? themeColors.success
                              : themeColors.text_muted,
                          border: `1.5px solid ${themeColors.bg_card}`,
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[11px] font-medium truncate"
                        style={{
                          color:
                            u.uid === currentUser.uid
                              ? themeColors.accent
                              : themeColors.text_main,
                        }}
                      >
                        {u.username}
                        {u.uid === currentUser.uid && (
                          <span
                            className="text-[9px] ml-1"
                            style={{ color: themeColors.text_muted }}
                          >
                            (you)
                          </span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center"
            style={{
              zIndex: 9999,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(8px)",
            }}
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard
                glow
                className="w-80 p-5"
                style={{
                  border: `1px solid ${themeColors.blue}30`,
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Swords size={16} style={{ color: themeColors.blue }} />
                    <h3
                      className="tinycaps text-sm font-bold"
                      style={{ color: themeColors.text_main }}
                    >
                      Invite to Server
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="p-1 rounded-lg transition-colors cursor-pointer"
                    style={{ color: themeColors.text_muted }}
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      className="text-[10px] font-medium mb-1 block tinycaps"
                      style={{ color: themeColors.text_sub }}
                    >
                      Username
                    </label>
                    <GlassInput
                      value={inviteUsername}
                      onChange={setInviteUsername}
                      placeholder="Target player"
                    />
                  </div>
                  <div>
                    <label
                      className="text-[10px] font-medium mb-1 block tinycaps"
                      style={{ color: themeColors.text_sub }}
                    >
                      Server Address
                    </label>
                    <GlassInput
                      value={inviteAddress}
                      onChange={setInviteAddress}
                      placeholder="e.g. mc.example.com"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label
                        className="text-[10px] font-medium mb-1 block tinycaps"
                        style={{ color: themeColors.text_sub }}
                      >
                        Port
                      </label>
                      <GlassInput
                        value={invitePort}
                        onChange={setInvitePort}
                        placeholder="25565"
                      />
                    </div>
                    <div className="flex-1">
                      <label
                        className="text-[10px] font-medium mb-1 block tinycaps"
                        style={{ color: themeColors.text_sub }}
                      >
                        MC Version
                      </label>
                      <GlassInput
                        value={inviteVersion}
                        onChange={setInviteVersion}
                        placeholder="1.20.4"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <GlowButton
                      size="sm"
                      variant="secondary"
                      fullWidth
                      onClick={() => setShowInvite(false)}
                    >
                      Cancel
                    </GlowButton>
                    <GlowButton
                      size="sm"
                      fullWidth
                      onClick={handleSendInvite}
                      disabled={
                        sending ||
                        !inviteUsername.trim() ||
                        !inviteAddress.trim()
                      }
                      className="flex items-center gap-1"
                    >
                      <UserPlus size={11} /> Send Invite
                    </GlowButton>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Message Bubble Component ──
function MessageBubble({
  msg,
  isOwn,
  themeColors,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  themeColors: any;
}) {
  if (msg.type === "system") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-1 px-2"
      >
        <p
          className="text-[10px] text-center tinycaps"
          style={{ color: themeColors.text_muted }}
        >
          {msg.text}
        </p>
      </motion.div>
    );
  }

  if (msg.type === "invite" && msg.inviteData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-2 px-1"
      >
        <div
          className="rounded-xl p-3 max-w-md mx-auto"
          style={{
            background: `linear-gradient(135deg, ${themeColors.blue}15, ${themeColors.purple || themeColors.blue}10)`,
            border: `1px solid ${themeColors.blue}30`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Swords size={14} style={{ color: themeColors.blue }} />
            <span
              className="tinycaps text-[11px] font-bold"
              style={{ color: themeColors.blue }}
            >
              Server Invite
            </span>
          </div>
          <p
            className="text-[11px] mb-2"
            style={{ color: themeColors.text_main }}
          >
            {msg.text}
          </p>
          <div
            className="flex items-center gap-3 text-[10px] mb-2"
            style={{ color: themeColors.text_sub }}
          >
            <span>
              {msg.inviteData.serverAddress}:{msg.inviteData.serverPort}
            </span>
            <span>•</span>
            <span>MC {msg.inviteData.mcVersion}</span>
          </div>
          <div className="flex gap-2">
            <GlowButton
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${msg.inviteData!.serverAddress}:${msg.inviteData!.serverPort}`
                );
              }}
            >
              Copy Address
            </GlowButton>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 py-1.5 px-2 rounded-lg transition-colors group ${isOwn ? "flex-row-reverse" : ""}`}
      style={{
        background: isOwn ? `${themeColors.accent}08` : "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isOwn
          ? `${themeColors.accent}12`
          : `${themeColors.bg_hover}40`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isOwn
          ? `${themeColors.accent}08`
          : "transparent";
      }}
    >
      <img
        src={msg.photoURL || STEVE_HEAD}
        alt=""
        className="w-7 h-7 rounded-lg object-cover shrink-0 mt-0.5"
        style={{ border: `1.5px solid ${themeColors.border}` }}
        onError={(e) => {
          (e.target as HTMLImageElement).src = STEVE_HEAD;
        }}
      />
      <div className={`min-w-0 flex-1 ${isOwn ? "text-right" : ""}`}>
        <div
          className={`flex items-center gap-2 mb-0.5 ${isOwn ? "justify-end" : ""}`}
        >
          <span
            className="tinycaps text-[10px] font-bold"
            style={{
              color: isOwn ? themeColors.accent : themeColors.text_sub,
            }}
          >
            {msg.username}
          </span>
          <span
            className="text-[9px] flex items-center gap-0.5"
            style={{ color: themeColors.text_muted }}
          >
            <Clock size={8} />
            {formatTime(msg.timestamp)}
          </span>
        </div>
        <p
          className="text-[12px] leading-relaxed break-words"
          style={{ color: themeColors.text_main }}
        >
          {msg.text}
        </p>
      </div>
    </motion.div>
  );
}
