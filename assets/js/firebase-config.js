// assets/js/firebase-config.js
// Firebase SDK แบบ Modular (ES Modules)
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Config ของโปรเจกต์
export const firebaseConfig = {
  apiKey: "AIzaSyCcOi0Ae3AHzxlhebHoDwxA_twdWA-1-z0",
  authDomain: "it-informatio.firebaseapp.com",
  projectId: "it-informatio",
  storageBucket: "it-informatio.firebasestorage.app",
  messagingSenderId: "18547295463",
  appId: "1:18547295463:web:e59e0655f184d33fbc4e42"
};

// กัน initializeApp ซ้ำ กรณีกลับหน้า/โหลดซ้ำ
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
