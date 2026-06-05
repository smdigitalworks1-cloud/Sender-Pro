// frontend/src/firebase.js
// Firebase client-side SDK initialization

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyChp5qp199cTYvK8qNMZG9M9qWh6KPvMDk",
  authDomain: "sender-pro-ad391.firebaseapp.com",
  projectId: "sender-pro-ad391",
  storageBucket: "sender-pro-ad391.firebasestorage.app",
  messagingSenderId: "137028386566",
  appId: "1:137028386566:web:faa0fe0020ffc3eeabe887",
  measurementId: "G-DQ11KRGG2Z"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics only in browser environment
let analytics = null;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

export { app, analytics };
