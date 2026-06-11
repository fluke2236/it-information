// assets/js/admin.js
import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// For creating users without signing out the current admin
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Theme & Sidebar logic (Shared)
const setupSharedUI = () => {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('color-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        });
    }

    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    const mobileOverlay = document.getElementById('mobileOverlay');

    const toggleMenu = () => {
        sidebar.classList.toggle('-translate-x-full');
        mobileOverlay.classList.toggle('hidden');
        setTimeout(() => mobileOverlay.classList.toggle('opacity-0'), 10);
    };

    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleMenu);
    if(closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleMenu);
    if(mobileOverlay) mobileOverlay.addEventListener('click', toggleMenu);
};

document.addEventListener('DOMContentLoaded', () => {
    setupSharedUI();

    const mockUserStr = localStorage.getItem('mockUser');
    let currentUser = null;

    if (mockUserStr) {
        currentUser = JSON.parse(mockUserStr);
        if(currentUser.role !== 'admin') {
            window.location.href = 'dashboard.html'; // Redirect if not admin
        } else {
            initAdminPanel(currentUser);
        }
    } else {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userDocSnap = await getDoc(doc(db, "users", user.uid));
                    if (userDocSnap.exists()) {
                        currentUser = userDocSnap.data();
                        if(currentUser.role !== 'admin') {
                            window.location.href = 'dashboard.html';
                        } else {
                            initAdminPanel(currentUser);
                        }
                    } else {
                        window.location.href = 'login.html';
                    }
                } catch(e) {
                    console.error("Auth Error:", e);
                    window.location.href = 'login.html';
                }
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    function initAdminPanel(adminUser) {
        document.getElementById('appBody').classList.remove('hidden');
        document.getElementById('userName').textContent = adminUser.name;
        document.getElementById('userRole').textContent = "ผู้ดูแลระบบ";
        document.getElementById('adminMenu').classList.remove('hidden');

        document.getElementById('logoutBtn').addEventListener('click', () => {
            if(mockUserStr) {
                localStorage.removeItem('mockUser');
                window.location.href = 'login.html';
            } else {
                signOut(auth).then(() => window.location.href = 'login.html');
            }
        });

        loadUsersList();
        setupUserModal();
    }

    async function loadUsersList() {
        const tbody = document.getElementById('userTableBody');
        
        if (mockUserStr) {
            // Mock Data
            tbody.innerHTML = `
                <tr class="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td class="py-4 px-4">
                        <div class="font-medium text-slate-800 dark:text-white">Admin Mock</div>
                        <div class="text-xs text-slate-500">admin@company.com</div>
                    </td>
                    <td class="py-4 px-4"><span class="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Admin</span></td>
                    <td class="py-4 px-4 text-center text-slate-600 dark:text-slate-400">10 / 30</td>
                    <td class="py-4 px-4 text-right">
                        <button class="text-brand-600 hover:text-brand-800 dark:text-sky-400 dark:hover:text-sky-300"><i class="ph ph-pencil-simple text-lg"></i></button>
                    </td>
                </tr>
            `;
            return;
        }

        try {
            const usersSnapshot = await getDocs(collection(db, "users"));
            tbody.innerHTML = ''; // Clear loading
            
            if (usersSnapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-500">ไม่พบข้อมูลผู้ใช้งาน</td></tr>`;
                return;
            }

            usersSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const roleColors = {
                    'admin': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    'manager': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                    'secretary': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                    'staff': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                };
                const roleDisplay = {
                    'admin': 'Admin', 'manager': 'Manager', 'secretary': 'Secretary', 'staff': 'Staff'
                };

                const annual = data.leave_quota?.annual || 0;
                const sick = data.leave_quota?.sick || 0;

                const tr = document.createElement('tr');
                tr.className = "border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors";
                tr.innerHTML = `
                    <td class="py-4 px-4">
                        <div class="font-medium text-slate-800 dark:text-white">${data.name}</div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">${data.email}</div>
                    </td>
                    <td class="py-4 px-4"><span class="px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase ${roleColors[data.role] || roleColors['staff']}">${roleDisplay[data.role] || data.role}</span></td>
                    <td class="py-4 px-4 text-center text-slate-600 dark:text-slate-400 text-sm font-mono">${annual} / ${sick}</td>
                    <td class="py-4 px-4 text-right">
                        <button class="edit-btn text-slate-400 hover:text-brand-600 dark:hover:text-sky-400 transition-colors p-2" data-uid="${docSnap.id}">
                            <i class="ph ph-pencil-simple text-lg"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Bind Edit events
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const uid = e.currentTarget.getAttribute('data-uid');
                    openEditModal(uid);
                });
            });

        } catch (error) {
            console.error("Error loading users:", error);
            tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>`;
        }
    }

    // Modal Logic
    const userModal = document.getElementById('userModal');
    const userModalContent = document.getElementById('userModalContent');
    const userForm = document.getElementById('userForm');
    let isEditMode = false;

    function toggleModal(show) {
        if (show) {
            userModal.classList.remove('hidden');
            setTimeout(() => {
                userModal.classList.remove('opacity-0');
                userModalContent.classList.remove('scale-95');
            }, 10);
        } else {
            userModal.classList.add('opacity-0');
            userModalContent.classList.add('scale-95');
            setTimeout(() => userModal.classList.add('hidden'), 300);
            userForm.reset();
            document.getElementById('modalError').classList.add('hidden');
            document.getElementById('userEmail').disabled = false; // Enable email for new users
        }
    }

    document.getElementById('addUserBtn').addEventListener('click', () => {
        isEditMode = false;
        document.getElementById('modalTitle').textContent = "เพิ่มผู้ใช้งานใหม่";
        document.getElementById('emailHelpText').classList.remove('hidden');
        document.getElementById('userId').value = "";
        
        // Reset Overrides
        document.getElementById('overrideApproveLeave').value = "inherit";
        document.getElementById('overrideApproveProject').value = "inherit";

        toggleModal(true);
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => toggleModal(false));
    document.getElementById('cancelModalBtn').addEventListener('click', () => toggleModal(false));

    async function openEditModal(uid) {
        isEditMode = true;
        document.getElementById('modalTitle').textContent = "แก้ไขผู้ใช้งาน";
        document.getElementById('emailHelpText').classList.add('hidden');
        document.getElementById('userEmail').disabled = true; // Cannot change email easily
        document.getElementById('userId').value = uid;

        try {
            const userDoc = await getDoc(doc(db, "users", uid));
            if(userDoc.exists()) {
                const data = userDoc.data();
                document.getElementById('userEmail').value = data.email;
                document.getElementById('userNameInput').value = data.name;
                document.getElementById('userRoleSelect').value = data.role;
                document.getElementById('userAnnualLeave').value = data.leave_quota?.annual || 10;
                document.getElementById('userSickLeave').value = data.leave_quota?.sick || 30;

                // Load overrides if they exist
                const overrideDoc = await getDoc(doc(db, "user_overrides", uid));
                if(overrideDoc.exists()) {
                    const overrides = overrideDoc.data().overrides || {};
                    document.getElementById('overrideApproveLeave').value = overrides.approve_leave || "inherit";
                    document.getElementById('overrideApproveProject').value = overrides.approve_project || "inherit";
                } else {
                    document.getElementById('overrideApproveLeave').value = "inherit";
                    document.getElementById('overrideApproveProject').value = "inherit";
                }

                toggleModal(true);
            }
        } catch(e) {
            console.error("Error fetching user details", e);
            alert("ไม่สามารถดึงข้อมูลได้");
        }
    }

    userForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const errorMsg = document.getElementById('modalError');
        const saveBtn = document.getElementById('saveUserBtn');
        const spinner = document.getElementById('saveSpinner');
        
        errorMsg.classList.add('hidden');
        saveBtn.disabled = true;
        spinner.classList.remove('hidden');

        const email = document.getElementById('userEmail').value;
        const name = document.getElementById('userNameInput').value;
        const role = document.getElementById('userRoleSelect').value;
        const annualLeave = parseInt(document.getElementById('userAnnualLeave').value);
        const sickLeave = parseInt(document.getElementById('userSickLeave').value);
        const uid = document.getElementById('userId').value;

        const overrideApproveLeave = document.getElementById('overrideApproveLeave').value;
        const overrideApproveProject = document.getElementById('overrideApproveProject').value;

        if (mockUserStr) {
            alert("Mock Mode: จำลองการบันทึกสำเร็จ");
            toggleModal(false);
            saveBtn.disabled = false;
            spinner.classList.add('hidden');
            return;
        }

        try {
            let targetUid = uid;

            if (!isEditMode) {
                // CREATE NEW USER via Secondary App (prevents signing out Admin)
                // Need to import options from original app config
                const secondaryApp = initializeApp(app.options, "Secondary");
                const secondaryAuth = getSecondaryAuth(secondaryApp);
                
                // Password defaults to "password"
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, "password");
                targetUid = userCredential.user.uid;
                
                // Sign out secondary auth to clean up
                await signOut(secondaryAuth);
            }

            // Update/Create Firestore User Document
            const userRef = doc(db, "users", targetUid);
            await setDoc(userRef, {
                email: email,
                name: name,
                role: role,
                leave_quota: {
                    annual: annualLeave,
                    sick: sickLeave
                },
                updatedAt: new Date()
            }, { merge: true }); // Merge true keeps createdAt if exists

            // Save Overrides
            let overridesToSave = {};
            if(overrideApproveLeave !== 'inherit') overridesToSave.approve_leave = overrideApproveLeave;
            if(overrideApproveProject !== 'inherit') overridesToSave.approve_project = overrideApproveProject;

            const overrideRef = doc(db, "user_overrides", targetUid);
            if (Object.keys(overridesToSave).length > 0) {
                await setDoc(overrideRef, { overrides: overridesToSave });
            } else {
                // If everything is inherit, we can just clear the overrides map
                await setDoc(overrideRef, { overrides: {} });
            }

            toggleModal(false);
            loadUsersList(); // Reload table

        } catch (error) {
            console.error("Save User Error:", error);
            errorMsg.textContent = error.message;
            errorMsg.classList.remove('hidden');
        } finally {
            saveBtn.disabled = false;
            spinner.classList.add('hidden');
        }
    });
});
