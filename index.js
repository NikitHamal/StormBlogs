import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
    import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
    import { getFirestore, collection, getDocs, query, orderBy, limit, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

    const firebaseConfig = {
        apiKey: "AIzaSyAnuHbSv6BniMyf3ltSZTSrIFa_92bHB-o",
        authDomain: "storm-blogs.firebaseapp.com",
        projectId: "storm-blogs",
        storageBucket: "storm-blogs.firebasestorage.app",
        messagingSenderId: "158567556221",
        appId: "1:158567556221:web:855dfa074fc5b65e68fd14"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth();
    const db = getFirestore(app);

    // Make auth available globally for logout function
    window.auth = auth;

    // Add loading state management
    let authInitialized = false;

    // Update UI based on auth state
    onAuthStateChanged(auth, (user) => {
        const loginBtn = document.getElementById('login-btn');
        const writeBtn = document.getElementById('write-btn');
        const writeButton = document.getElementById('writeButton');
        const welcomeTitle = document.getElementById('welcomeTitle');
        const welcomeSubtitle = document.getElementById('welcomeSubtitle');
        const getStartedButton = document.getElementById('getStartedButton');
        const authButtons = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
        const loadingOverlay = document.getElementById('loadingOverlay');
        const heroContent = document.querySelector('.hero-content');
        const dropdownUserName = document.getElementById('dropdown-user-name');
        const dropdownUserEmail = document.getElementById('dropdown-user-email');

        // Add transition class before making changes
        heroContent.classList.add('auth-transition');

        if (user) {
            // User is signed in
            loginBtn.textContent = 'Logout';
            loginBtn.onclick = handleLogout;
            writeBtn.style.display = 'inline-block';
            writeButton.style.display = 'inline-block';
            welcomeTitle.textContent = `Welcome back, ${user.displayName || 'Writer'}!`;
            welcomeSubtitle.textContent = 'Ready to share your next story with the world?';
            getStartedButton.textContent = "Write Your Story";
            getStartedButton.href = "write.html";
            
            // Update dropdown user info
            if (dropdownUserName) dropdownUserName.textContent = user.displayName || 'Anonymous';
            if (dropdownUserEmail) dropdownUserEmail.textContent = user.email;
            
            // Update user info display with transition
            if (authButtons) {
                authButtons.style.display = 'none';
                authButtons.classList.remove('visible');
            }
            if (userInfo) {
                userInfo.style.display = 'flex';
                setTimeout(() => userInfo.classList.add('visible'), 50);
            }
        } else {
            // User is signed out
            loginBtn.textContent = 'Login';
            loginBtn.onclick = () => location.href = 'login.html';
            writeBtn.style.display = 'none';
            writeButton.style.display = 'none';
            welcomeTitle.textContent = 'Welcome to StormBlogs';
            welcomeSubtitle.textContent = 'A place where ideas take flight and stories come to life. Join our community of writers, thinkers, and storytellers.';
            getStartedButton.textContent = "Get Started Today";
            getStartedButton.href = "login.html";
            
            // Update user info display with transition
            if (authButtons) {
                authButtons.style.display = 'block';
                setTimeout(() => authButtons.classList.add('visible'), 50);
            }
            if (userInfo) {
                userInfo.style.display = 'none';
                userInfo.classList.remove('visible');
            }
        }

        // Remove transition class after changes
        setTimeout(() => {
            heroContent.classList.remove('auth-transition');
        }, 50);

        // Hide loading overlay after first auth check
        if (!authInitialized) {
            authInitialized = true;
            setTimeout(() => {
                loadingOverlay.classList.add('fade-out');
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }, 300);
        }
    });

    // Dropdown toggle function
    window.toggleDropdown = function() {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    }

    // Logout handler
    window.handleLogout = async function(event) {
        event.preventDefault();
        try {
            await signOut(window.auth);
            window.location.reload();
        } catch (error) {
            console.error('Error signing out:', error);
        }
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('profile-dropdown');
        const avatar = document.getElementById('user-avatar');
        if (dropdown && avatar && !avatar.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Handle auth state changes
    onAuthStateChanged(auth, (user) => {
        const authButtons = document.getElementById('auth-buttons');
        const userInfo = document.getElementById('user-info');
        const writeNav = document.getElementById('write-nav');
        const adminOption = document.getElementById('admin-option');
        const userAvatar = document.getElementById('user-avatar');
        
        if (user) {
            console.log('Current user email:', user.email);
            
            // User is signed in
            if (authButtons) authButtons.style.display = 'none';
            if (userInfo) userInfo.style.display = 'flex';
            if (writeNav) writeNav.style.display = 'block';
            
            // Update user info
            if (userAvatar) userAvatar.src = user.photoURL || 'profile.jpg';
            
            // Check for admin access
            if (adminOption && (user.email === 'iamnikithamal@gmail.com' || user.email === 'nikithamal010@gmail.com')) {
                console.log('Admin access granted for:', user.email);
                adminOption.style.display = 'block';
            } else if (adminOption) {
                console.log('Not an admin user:', user.email);
                adminOption.style.display = 'none';
            }
            
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            // User is signed out
            if (authButtons) authButtons.style.display = 'block';
            if (userInfo) userInfo.style.display = 'none';
            if (writeNav) writeNav.style.display = 'none';
            localStorage.removeItem('user');
        }
    });