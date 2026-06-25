import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth & Firestore
export const auth = getAuth(app);
let databaseId = (firebaseConfig as any).firestoreDatabaseId;
if (!databaseId || databaseId === "default" || databaseId === "(default)") {
  databaseId = "ai-studio-67413ef4-f387-460c-8d88-15d91993e264";
}
export const db = getFirestore(app, databaseId);

// Google OAuth Provider setup with scopes
export const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/calendar");
provider.addScope("https://www.googleapis.com/auth/gmail.compose");

// Memory cache for Workspace API token of currently signed in user
let cachedAccessToken: string | null = typeof window !== "undefined" ? localStorage.getItem("g_access_token") : null;
let isSigningIn = false;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Try loading from localStorage
        const storedToken = typeof window !== "undefined" ? localStorage.getItem("g_access_token") : null;
        if (storedToken) {
          cachedAccessToken = storedToken;
          if (onAuthSuccess) onAuthSuccess(user, storedToken);
        } else {
          // Token might need a refresh or re-key.
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      if (typeof window !== "undefined") {
        localStorage.removeItem("g_access_token");
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Google Auth Provider.");
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem("g_access_token", credential.accessToken);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== "undefined") {
    cachedAccessToken = localStorage.getItem("g_access_token");
  }
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string) => {
  cachedAccessToken = token;
  if (typeof window !== "undefined") {
    localStorage.setItem("g_access_token", token);
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("g_access_token");
  }
};

// Validate Connection to Firestore (MANDATORY per system instruction)
export async function testConnection() {
  try {
    const testDoc = doc(db, "test", "connection");
    await getDocFromServer(testDoc);
    console.log("Firestore connection test passed successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("Firebase client appears to be offline or initializing. Please verify your connection.");
    } else {
      // Ignore other errors if document does not exist (it's totally normal for test/connection to be missing)
      console.log("Firestore connection initialized.");
    }
  }
}

setTimeout(() => {
  testConnection();
}, 500);
