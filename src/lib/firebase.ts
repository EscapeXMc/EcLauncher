// @ts-ignore
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, type User } from "firebase/auth";
// @ts-ignore
import { getDatabase, ref, set, get, push, onValue, onChildAdded, onChildChanged, serverTimestamp, query, orderByChild, limitToLast, update, remove, off, equalTo } from "firebase/database";

// IMPORTANT: Replace these with YOUR Firebase project config
// Go to https://console.firebase.google.com → Project Settings → Your apps → Web icon
const firebaseConfig = {
  apiKey: "AIzaSyAwrNiB1Jl_oj5JpAtq6igkl9Irdp6qH14",
  authDomain: "eclauncher-chatsystem.firebaseapp.com",
  databaseURL: "https://eclauncher-chatsystem-default-rtdb.firebaseio.com",
  projectId: "eclauncher-chatsystem",
  storageBucket: "eclauncher-chatsystem.firebasestorage.app",
  messagingSenderId: "310768413294",
  appId: "1:310768413294:web:462f7c9074a511d1da147f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

export { app, auth, db };
export {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
  ref, set, get, push, onValue, onChildAdded, onChildChanged, serverTimestamp, query, orderByChild, limitToLast, update, remove, equalTo,
};
export type { User };
