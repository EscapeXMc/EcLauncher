import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile,
  ref, set, get, push, onValue, onChildAdded, onChildChanged, serverTimestamp,
  query, orderByChild, limitToLast, update, remove,
} from "./firebase";
import type { User } from "./firebase";

export interface ChatUser {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  photoURL: string;
  status: "online" | "offline";
  lastSeen: number;
  createdAt: number;
  mcUsername?: string;
}

export interface ChatMessage {
  id: string;
  uid: string;
  username: string;
  photoURL: string;
  text: string;
  timestamp: number;
  type: "message" | "system" | "invite";
  inviteData?: {
    serverAddress: string;
    serverPort: number;
    mcVersion: string;
  };
}

// Auth functions
export async function registerUser(email: string, password: string, username: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if username is taken
    const usernameRef = ref(db, `usernames/${username}`);
    const usernameSnap = await get(usernameRef);
    if (usernameSnap.exists()) {
      return { success: false, error: "Username already taken" };
    }

    // Create auth account
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    // Update display name
    await updateProfile(user, { displayName: username });

    // Create user profile in database
    const userProfile: ChatUser = {
      uid: user.uid,
      username,
      email,
      displayName: username,
      photoURL: "", // Will be Steve head URL
      status: "online",
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    await set(ref(db, `users/${user.uid}`), userProfile);
    await set(ref(db, `usernames/${username}`), user.uid);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loginUser(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // Set online
    if (auth.currentUser) {
      await update(ref(db, `users/${auth.currentUser.uid}`), {
        status: "online",
        lastSeen: Date.now(),
      });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function logoutUser(): Promise<void> {
  if (auth.currentUser) {
    await update(ref(db, `users/${auth.currentUser.uid}`), {
      status: "offline",
      lastSeen: Date.now(),
    });
    await signOut(auth);
  }
}

export async function uploadProfileImage(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) return { success: false, error: "Not logged in" };

    // Convert to base64 and store in database (no Storage needed)
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Resize to keep database small
    const img = new Image();
    const dataUrlResolved = await new Promise<string>((resolve) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = dataUrl;
    });

    // Update profile
    await updateProfile(user, { photoURL: dataUrlResolved });
    await update(ref(db, `users/${user.uid}`), { photoURL: dataUrlResolved });

    return { success: true, url: dataUrlResolved };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Chat functions
export async function sendMessage(text: string, type: "message" | "system" | "invite" = "message", inviteData?: any): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");

  const msgRef = ref(db, "messages");
  const newMsg = push(msgRef);

  const message: ChatMessage = {
    id: newMsg.key || "",
    uid: user.uid,
    username: user.displayName || "Unknown",
    photoURL: user.photoURL || "",
    text,
    timestamp: Date.now(),
    type,
    ...(inviteData ? { inviteData } : {}),
  };

  await set(newMsg, message);
}

export function subscribeToMessages(callback: (messages: ChatMessage[]) => void): () => void {
  const messagesRef = query(ref(db, "messages"), orderByChild("timestamp"), limitToLast(100));

  const unsubscribe = onValue(messagesRef, (snapshot: any) => {
    const messages: ChatMessage[] = [];
    snapshot.forEach((child: any) => {
      const data = child.val();
      if (data) messages.push({ ...data, id: child.key || "" });
    });
    callback(messages.sort((a, b) => a.timestamp - b.timestamp));
  }, (error: any) => {
    console.error("Chat subscription error:", error);
  });

  return unsubscribe;
}

export function subscribeToOnlineUsers(callback: (users: ChatUser[]) => void): () => void {
  const usersRef = ref(db, "users");

  const unsubscribe = onValue(usersRef, (snapshot: any) => {
    const users: ChatUser[] = [];
    snapshot.forEach((child: any) => {
      const data = child.val();
      if (data) users.push(data);
    });
    callback(users.sort((a, b) => (b.status === "online" ? 1 : 0) - (a.status === "online" ? 1 : 0)));
  });

  return unsubscribe;
}

export async function getUserByUsername(username: string): Promise<ChatUser | null> {
  try {
    const usernameRef = ref(db, `usernames/${username}`);
    const usernameSnap = await get(usernameRef);
    if (!usernameSnap.exists()) return null;

    const uid = usernameSnap.val();
    const userRef = ref(db, `users/${uid}`);
    const userSnap = await get(userRef);
    if (!userSnap.exists()) return null;

    return userSnap.val();
  } catch {
    return null;
  }
}

export async function sendInvite(targetUsername: string, serverAddress: string, serverPort: number, mcVersion: string): Promise<{ success: boolean; error?: string }> {
  const user = auth.currentUser;
  if (!user) return { success: false, error: "Not logged in" };

  const targetUser = await getUserByUsername(targetUsername);
  if (!targetUser) return { success: false, error: "User not found" };

  await sendMessage(`🎮 ${user.displayName} invited you to join ${serverAddress}:${serverPort}`, "invite", {
    serverAddress,
    serverPort,
    mcVersion,
    fromUser: user.displayName,
    fromUid: user.uid,
    toUser: targetUsername,
    toUid: targetUser.uid,
  });

  return { success: true };
}

// Set user online status
export function setupPresence() {
  const user = auth.currentUser;
  if (!user) return;

  const userRef = ref(db, `users/${user.uid}`);
  update(userRef, { status: "online", lastSeen: Date.now() });
}
