import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, increment, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAnuHbSv6BniMyf3ltSZTSrIFa_92bHB-o",
    authDomain: "storm-blogs.firebaseapp.com",
    projectId: "storm-blogs",
    storageBucket: "storm-blogs.firebasestorage.app",
    messagingSenderId: "158567556221",
    appId: "1:158567556221:web:855dfa074fc5b65e68fd14"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

let startTime;
let readingInterval;
let totalReadTime = 0;
let isVisible = true;
let articleId;
let currentUser;
let hasRecordedView = false;

// Get article ID from URL
const urlParams = new URLSearchParams(window.location.search);
articleId = urlParams.get('id');

// Handle visibility change
document.addEventListener('visibilitychange', () => {
    isVisible = !document.hidden;
    if (isVisible) {
        startTracking();
    } else {
        stopTracking();
    }
});

// Start tracking reading time
function startTracking() {
    if (!startTime) {
        startTime = Date.now();
    }
    readingInterval = setInterval(updateReadTime, 1000);
}

// Stop tracking reading time
function stopTracking() {
    if (readingInterval) {
        clearInterval(readingInterval);
        if (startTime) {
            totalReadTime += (Date.now() - startTime) / 1000;
            startTime = null;
        }
    }
}

// Update reading time
function updateReadTime() {
    if (startTime && isVisible) {
        const currentTime = Date.now();
        const sessionTime = (currentTime - startTime) / 1000;
        totalReadTime = sessionTime;
    }
}

// Record view and initialize reading time tracking
async function recordView() {
    if (!articleId || hasRecordedView) return;

    try {
        const articleRef = doc(db, "posts", articleId);
        const articleDoc = await getDoc(articleRef);

        if (!articleDoc.exists()) return;

        const articleData = articleDoc.data();
        
        // Check if this user has already viewed this article
        const viewHistory = articleData.viewHistory || [];
        const userViews = viewHistory.filter(view => 
            view.userId === (currentUser?.uid || 'anonymous')
        );

        // Only record view if user hasn't viewed in the last 24 hours
        const lastView = userViews[userViews.length - 1];
        const canRecordView = !lastView || 
            (lastView.timestamp && 
             (new Date() - lastView.timestamp.toDate()) / (1000 * 60 * 60) >= 24);

        if (canRecordView) {
            // Record view
            const updateData = {
                viewHistory: arrayUnion({
                    timestamp: serverTimestamp(),
                    userId: currentUser?.uid || 'anonymous',
                    userAgent: navigator.userAgent
                })
            };

            // If views field doesn't exist, initialize it
            if (typeof articleData.views === 'undefined') {
                updateData.views = 1;
            } else {
                updateData.views = increment(1);
            }

            await updateDoc(articleRef, updateData);

            // Update author's total views if this is a new view
            if (articleData.authorId && articleData.authorId !== currentUser?.uid) {
                const authorRef = doc(db, "users", articleData.authorId);
                await updateDoc(authorRef, {
                    totalViews: increment(1)
                });
            }

            hasRecordedView = true;
        }

        // Start tracking reading time
        startTracking();

    } catch (error) {
        console.error('Error recording view:', error);
    }
}

// Save reading time when leaving the page
async function saveReadingTime() {
    if (!articleId || totalReadTime < 5) return; // Only save if read for more than 5 seconds

    try {
        const articleRef = doc(db, "posts", articleId);
        const articleDoc = await getDoc(articleRef);

        if (!articleDoc.exists()) return;

        const readTimeInMinutes = Math.round(totalReadTime / 60);
        
        const updateData = {
            readTimeHistory: arrayUnion({
                timestamp: serverTimestamp(),
                userId: currentUser?.uid || 'anonymous',
                timeSpent: readTimeInMinutes,
                userAgent: navigator.userAgent
            })
        };

        // If totalReadTime field doesn't exist, initialize it
        const articleData = articleDoc.data();
        if (typeof articleData.totalReadTime === 'undefined') {
            updateData.totalReadTime = readTimeInMinutes;
        } else {
            updateData.totalReadTime = increment(readTimeInMinutes);
        }

        await updateDoc(articleRef, updateData);

    } catch (error) {
        console.error('Error saving reading time:', error);
    }
}

// Initialize
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    recordView();
});

// Save reading time before leaving the page
window.addEventListener('beforeunload', () => {
    stopTracking();
    saveReadingTime();
});

// Add periodic saving of read time
setInterval(() => {
    if (totalReadTime > 0) {
        saveReadingTime();
    }
}, 60000); // Save every minute 