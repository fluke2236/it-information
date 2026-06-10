// assets/js/dashboard.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            // Toggle HTML class
            document.documentElement.classList.toggle('dark');
            
            // Save preference to localStorage
            if (document.documentElement.classList.contains('dark')) {
                localStorage.setItem('color-theme', 'dark');
            } else {
                localStorage.setItem('color-theme', 'light');
            }
        });
    }

    // Mobile Menu Toggle Logic
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    function toggleMenu() {
        sidebar.classList.toggle('-translate-x-full');
        mobileOverlay.classList.toggle('hidden');
        setTimeout(() => {
            mobileOverlay.classList.toggle('opacity-0');
        }, 10);
    }

    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMenu);
    if(closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleMenu);
    if(mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);

    // Auth Logic
    const mockUserStr = localStorage.getItem('mockUser');
    let currentUser = null;

    if (mockUserStr) {
        currentUser = JSON.parse(mockUserStr);
        initDashboard(currentUser);
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    
                    if (userDocSnap.exists()) {
                        currentUser = userDocSnap.data();
                        initDashboard(currentUser);
                    } else {
                        initDashboard({ name: user.email, role: 'staff' });
                    }
                } catch(e) {
                    console.error("Error fetching user data:", e);
                    initDashboard({ name: user.email, role: 'staff' });
                }
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    function initDashboard(user) {
        document.getElementById('appBody').classList.remove('hidden');
        document.getElementById('userName').textContent = user.name;
        
        let roleDisplay = "พนักงานทั่วไป";
        if (user.role === 'admin') roleDisplay = "ผู้ดูแลระบบ";
        if (user.role === 'manager') roleDisplay = "หัวหน้างาน";
        if (user.role === 'secretary') roleDisplay = "เลขาฯ";
        
        document.getElementById('userRole').textContent = roleDisplay;

        if (user.role === 'admin') {
            document.getElementById('adminMenu').classList.remove('hidden');
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if(mockUserStr) {
                    localStorage.removeItem('mockUser');
                    window.location.href = 'login.html';
                } else {
                    signOut(auth).then(() => {
                        window.location.href = 'login.html';
                    }).catch((error) => console.error("Logout Error:", error));
                }
            });
        }
    }
});
