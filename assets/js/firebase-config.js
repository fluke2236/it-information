// assets/js/firebase-config.js

// นำเข้า Firebase SDK แบบ Modular (ES Modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: แทนที่ค่าเหล่านี้ด้วย Firebase Config ของคุณเอง
// คุณสามารถหาได้จาก Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
  apiKey: "AIzaSyCcOi0Ae3AHzxlhebHoDwxA_twdWA-1-z0",
  authDomain: "it-informatio.firebaseapp.com",
  projectId: "it-informatio",
  storageBucket: "it-informatio.firebasestorage.app",
  messagingSenderId: "18547295463",
  appId: "1:18547295463:web:e59e0655f184d33fbc4e42"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
