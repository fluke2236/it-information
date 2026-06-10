// assets/js/auth.js
import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorMsg = document.getElementById('error-message');
            const loginBtn = document.getElementById('loginBtn');
            const loginSpinner = document.getElementById('loginSpinner');
            
            // UI Loading state
            errorMsg.classList.add('hidden');
            loginBtn.disabled = true;
            loginSpinner.classList.remove('hidden');

            try {
                // จำลองการตรวจสอบ (หากยังไม่มี Firebase จริง ให้ใส่ try catch ไว้เพื่อดัก Error API KEY)
                try {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    // Login สำเร็จ จะถูก Redirect โดย onAuthStateChanged ใน index.html 
                    // แต่ในที่นี้เราสามารถ force redirect ได้เลย
                    window.location.href = 'dashboard.html';
                } catch (firebaseError) {
                    // MOCK MODE: หากใช้ API Key ปลอม จะ Error แน่นอน เราจะทำ Mock Login ให้ดูผลลัพธ์
                    console.warn("Firebase Auth Error (อาจเพราะยังไม่ได้ใส่ API Key จริง):", firebaseError);
                    
                    if (email === "admin@company.com" && password === "password") {
                        // จำลองว่าล็อกอินสำเร็จด้วย LocalStorage สำหรับตัวอย่าง
                        localStorage.setItem('mockUser', JSON.stringify({ email: email, role: 'admin', name: 'ผู้ดูแลระบบสูงสุด' }));
                        window.location.href = 'dashboard.html';
                    } else if (email === "staff@company.com" && password === "password") {
                        localStorage.setItem('mockUser', JSON.stringify({ email: email, role: 'staff', name: 'พนักงานทั่วไป' }));
                        window.location.href = 'dashboard.html';
                    } else {
                        throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง (ตัวอย่าง Mock: admin@company.com / password)');
                    }
                }
                
            } catch (error) {
                errorMsg.textContent = error.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
                errorMsg.classList.remove('hidden');
            } finally {
                loginBtn.disabled = false;
                loginSpinner.classList.add('hidden');
            }
        });
    }
});
