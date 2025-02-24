import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, get, update, child, increment, push, set } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai@0.3.0";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAnuHbSv6BniMyf3ltSZTSrIFa_92bHB-o",
    authDomain: "storm-blogs.firebaseapp.com",
    databaseURL: "https://storm-blogs-default-rtdb.firebaseio.com",
    projectId: "storm-blogs",
    storageBucket: "storm-blogs.firebasestorage.app",
    messagingSenderId: "158567556221",
    appId: "1:158567556221:web:855dfa074fc5b65e68fd14"
};

// Initialize Firebase and Gemini
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const genAI = new GoogleGenerativeAI("AIzaSyACk4YyXgd_VOvBlFWV8r17LuwkT1iGfmg");
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: {
        parts: [{ text: "You are an expert assistant for this article." }]
    }
});

let articleContext = '';
let chatHistory = [];

// Remove shimmer effect
const loadingHTML = `<p>Loading...</p>`;

// Constants for XP
const INTERACTION_XP = {
    LIKE: 5,
    COMMENT: 10,
    READ_TIME_PER_MINUTE: 1,
    MAX_READ_TIME_XP: 30
};

// Make all functions globally available
window.checkUserLike = async (articleId) => {
    if (!auth.currentUser) return false;
    const articleRef = ref(db, `posts/${articleId}/likedBy/${auth.currentUser.uid}`);
    const snapshot = await get(articleRef);
    return snapshot.exists();
};

// Handle like/unlike
window.handleLike = async (articleId) => {
    if (!auth.currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // Check if user is verified
    if (!auth.currentUser.emailVerified) {
        alert('Please verify your email before interacting with this post.');
        return;
    }

    const articleRef = ref(db, `posts/${articleId}`);
    const userLikeRef = ref(db, `posts/${articleId}/likedBy/${auth.currentUser.uid}`);
    const snapshot = await get(userLikeRef);
    const hasLiked = snapshot.exists();

    try {
        if (hasLiked) {
            // Unlike
            await update(articleRef, {
                [`likedBy/${auth.currentUser.uid}`]: null,
                'data/likes': increment(-1)
            });
        } else {
            // Like and award XP
            await update(articleRef, {
                [`likedBy/${auth.currentUser.uid}`]: true,
                'data/likes': increment(1)
            });

            // Award XP to the post author
            const articleSnapshot = await get(articleRef);
            const authorId = articleSnapshot.val()?.data?.author;
            if (authorId) {
                await update(ref(db, `users/${authorId}`), {
                    xp: increment(INTERACTION_XP.LIKE)
                });
            }
        }

        // Update UI
        const likeButton = document.getElementById('likeButton');
        const likeCount = document.getElementById('likeCount');
        if (likeButton) {
            likeButton.classList.toggle('liked', !hasLiked);
        }
        if (likeCount) {
            const articleSnapshot = await get(articleRef);
            const likes = articleSnapshot.val()?.data?.likes || 0;
            likeCount.textContent = likes;
        }

        // Update post ranking
        await updatePostRanking(articleId);
    } catch (error) {
        console.error('Error handling like:', error);
        showNotification('Failed to update like', 'error');
    }
};

// Add this in the global functions section
window.handleChatInput = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

// Add this helper function
function truncateContext(text, maxLength = 30000) {
    return text.length > maxLength 
        ? text.substring(0, maxLength) + '... [truncated]' 
        : text;
}

window.generateSummary = async () => {
    const summaryBtn = document.querySelector('.summary-btn');
    const summaryContent = document.getElementById('summaryContent');
    
    try {
        summaryBtn.disabled = true;
        summaryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        const prompt = `Please provide a concise 3-paragraph summary of this article. 
    Focus on key points and main arguments. 
    Article: ${articleContext}`;
        const result = await model.generateContent(prompt);
        const summary = await result.response.text();
        
        summaryContent.innerHTML = `
            <div class="summary-box">
                <h3>AI Summary</h3>
                <p>${summary}</p>
            </div>
        `;
    } catch (error) {
        console.error("Error generating summary:", error);
        summaryContent.innerHTML = '<p class="error">Failed to generate summary. Please try again.</p>';
    } finally {
        summaryBtn.disabled = false;
        summaryBtn.innerHTML = '<i class="fas fa-robot"></i> Summarize with AI';
    }
};

// Update the sendMessage function
window.sendMessage = async () => {
    const chatInput = document.getElementById('chatInput');
    const userMessage = chatInput.value.trim();
    
    if (!userMessage) return;
    
    try {
        appendMessage('user', userMessage);
        chatInput.value = '';
        appendMessage('typing', '');

        // Structure message properly
        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                maxOutputTokens: 1000,
            },
            systemInstruction: {
                role: "model",
                parts: [{ text: `You are discussing this article: ${articleContext}` }]
            }
        });

        // Send message with proper structure
        const result = await chat.sendMessage(userMessage);
        const response = await result.response.text();
        
        removeTypingIndicator();
        appendMessage('ai', response);
        
        // Store history correctly
        chatHistory.push({
            role: "user",
            parts: [{ text: userMessage }]
        });
        chatHistory.push({
            role: "model",
            parts: [{ text: response }]
        });
        
    } catch (error) {
        console.error("Error sending message:", error);
        removeTypingIndicator();
        appendMessage('error', 'Failed to get response. Please try again.');
    }
};

window.appendMessage = (type, content) => {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    
    if (type === 'typing') {
        messageDiv.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-content">
                ${type === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}
                <p>${content}</p>
            </div>
        `;
    }
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

window.removeTypingIndicator = () => {
    const typingIndicator = document.querySelector('.typing-indicator')?.parentElement;
    if (typingIndicator) {
        typingIndicator.remove();
    }
};

// Fetch the post from Realtime Database
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');

async function loadPost() {
    const articleContent = document.getElementById("article-content");
    if (!articleContent) return;
    
    document.body.style.display = 'none';
    articleContent.innerHTML = loadingHTML;

    if (!postId) {
        articleContent.innerHTML = "<p>Article not found</p>";
        return;
    }

    if (!navigator.onLine) {
        articleContent.innerHTML = '<p>Client is offline. Please check your internet connection.</p>';
        return;
    }

    const articleRef = ref(db, `posts/${postId}`);
    try {
        const articleSnapshot = await get(articleRef);
        document.body.style.display = 'block';

        if (articleSnapshot.exists()) {
            const post = articleSnapshot.val();
            
            // Fetch author details from correct path
            const authorRef = ref(db, `users/${post.data.author}`);
            const authorSnapshot = await get(authorRef);
            const authorData = authorSnapshot.val() || {};
            
            // Check if current user is the author
            const isAuthor = auth.currentUser && auth.currentUser.uid === post.data.author;
            
            articleContent.innerHTML = `
                <p id="article-category" style="color:black; font-size:12px; font-weight:500; margin-bottom: 8px; background-color:#D7AFFF; border-radius:32px; padding:4px 16px; width:fit-content;"></p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h1 id="article-title" style="margin: 0;"></h1>
                    ${isAuthor ? `
                        <button onclick="editPost()" class="edit-button" style="background: #1a73e8; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-edit"></i> Edit Post
                        </button>
                    ` : ''}
                </div>
                <article role="article" id="article-body" style="font-size:16px; font-weight:400; line-height: 2; white-space: pre-line; word-wrap: break-word;"></article>
                <div style="display: flex; align-items: center; margin-top:32px;">
                    <img src="${authorData.photoURL || 'https://i.pravatar.cc/150?u=default'}" alt="Profile" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; margin-right: 8px;">
                    <span style="font-weight: 500; font-size: 18px; margin-right:12px;">${authorData.displayName || 'Anonymous'}</span>
                    <i class="far fa-clock" style="margin-right: 5px;"></i>
                    <span id="article-time" style="font-size:14px;"></span>
                </div>
            `;

            const elements = {
                title: document.getElementById("article-title"),
                titleB: document.getElementById("article-title-b"),
                category: document.getElementById("article-category"),
                time: document.getElementById("article-time"),
                body: document.getElementById("article-body")
            };

            if (elements.title) elements.title.textContent = post.data?.title || 'Untitled';
            if (elements.titleB) elements.titleB.textContent = post.data?.title || 'Untitled';
            if (elements.category) elements.category.textContent = post.data?.category || 'Uncategorized';
            if (elements.time) elements.time.textContent = post.data?.timestamp ? formatTimeAgo(Date.now() - post.data.timestamp) : 'Unknown time';
            if (elements.body) elements.body.innerHTML = post.data?.content || '<p>No content available</p>';

            const likeButton = document.getElementById("likeButton");
            const likeCount = document.getElementById("likeCount");
            if (likeCount) likeCount.textContent = post.data?.likes || 0;
            
            if (likeButton && auth.currentUser) {
                const userLikeRef = ref(db, `posts/${postId}/likedBy/${auth.currentUser.uid}`);
                const userLikeSnapshot = await get(userLikeRef);
                if (userLikeSnapshot.exists()) {
                    const icon = likeButton.querySelector('i');
                    if (icon) {
                        icon.classList.remove('far');
                        icon.classList.add('fas');
                    }
                }
            }

            await loadComments();
            articleContext = `Title: ${post.data?.title}\n\nContent: ${post.data?.content}`;

            const profileImage = document.querySelector('img[alt="Profile"]');
            if (profileImage && post.data?.authorPhotoURL) {
                profileImage.src = post.data.authorPhotoURL;
            }

            chatHistory = [
                { role: "user", parts: [{ text: `ARTICLE CONTEXT: ${articleContext}` }] },
                { role: "model", parts: [{ text: 'I have read the article. Ask me anything!' }] }
            ];
        } else {
            articleContent.innerHTML = "<p>Article not found</p>";
        }
    } catch (error) {
        articleContent.innerHTML = "<p>Error loading article. Please try again later.</p>";
    }
}

document.addEventListener('dblclick', async (event) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (!selectedText || selectedText.split(/\s+/).length > 2) {
        return; // Ignore selections longer than 2 words
    }

    try {
        // Show loading indicator
        const tooltip = createDefinitionTooltip(event.clientX, event.clientY);
        tooltip.innerHTML = '<div class="loading">Analyzing...</div>';

        // Get definition from Gemini
        const prompt = `Define "${selectedText}" in this article's context: ${articleContext}\n` + 
                      `Provide: 1. Dictionary definition 2. Contextual meaning 3. Example sentence`;
        
        const result = await model.generateContent(prompt);
        const definition = await result.response.text();

        // Display result
        tooltip.innerHTML = `
            <div class="definition-card">
                <h4>${selectedText}</h4>
                <div class="definition-content">${definition}</div>
                <button onclick="this.parentElement.remove()" class="close-btn">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

    } catch (error) {
        console.error("Definition error:", error);
        tooltip.innerHTML = '<div class="error">Failed to load definition</div>';
        setTimeout(() => tooltip.remove(), 2000);
    }
});

function createDefinitionTooltip(x, y) {
    const existingTooltip = document.querySelector('.definition-tooltip');
    if (existingTooltip) existingTooltip.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'definition-tooltip';
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
    document.body.appendChild(tooltip);
    return tooltip;
}

// Rate limiting
let lastRequest = 0; 
document.addEventListener('dblclick', async (event) => {
    if (Date.now() - lastRequest < 2000) return;
    lastRequest = Date.now();
});

// Keyboard shortcut support
document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === 'd') {
        const selection = window.getSelection();
        // Trigger definition lookup
    }
});

// Click-outside-to-close
document.addEventListener('click', (e) => {
    if (!e.target.closest('.definition-tooltip')) {
        document.querySelectorAll('.definition-tooltip').forEach(t => t.remove());
    }
});

async function loadComments() {
    const articleRef = ref(db, `posts/${postId}/comments`);
    const commentsSnapshot = await get(articleRef);
    
    const commentsList = document.getElementById('comments-list');
    const commentCount = document.getElementById('comment-count');
    
    if (!commentsList || !commentCount) return;

    if (!commentsSnapshot.exists()) {
        commentsList.innerHTML = '<p>No comments yet. Be the first to comment!</p>';
        commentCount.textContent = '0';
        return;
    }
    
    const commentsData = commentsSnapshot.val();
    const commentsArray = Object.entries(commentsData || {}).map(([key, value]) => ({
        id: key,
        ...value
    })).sort((a, b) => b.timestamp - a.timestamp);
    
    const commentsHtml = commentsArray.map(comment => `
        <div style="background: #f8f8f8; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img src="${comment.userPhotoURL || 'profile.jpg'}" alt="Profile" 
                        style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                    <strong>${comment.userName}</strong>
                </div>
                <span style="color: #666; font-size: 0.9em;">${formatTimeAgo(Date.now() - comment.timestamp)}</span>
            </div>
            <p style="margin: 0; line-height: 1.5;">${comment.text}</p>
        </div>
    `).join('');
    
    commentsList.innerHTML = commentsHtml;
    commentCount.textContent = commentsArray.length;
}

// Update comment submission
document.getElementById('submit-comment')?.addEventListener('click', async () => {
    if (!auth.currentUser) {
        alert('Please login to comment');
        window.location.href = 'login.html';
        return;
    }

    if (!auth.currentUser.emailVerified) {
        alert('Please verify your email before interacting with this post.');
        return;
    }

    const commentInput = document.getElementById('comment-input');
    const comment = commentInput.value;
    if (!comment.trim()) return;
    
    try {
        const commentData = {
            text: comment,
            timestamp: Date.now(),
            userId: auth.currentUser.uid,
            userName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
            userPhotoURL: auth.currentUser.photoURL
        };

        const articleRef = ref(db, `posts/${postId}`);
        const newCommentRef = push(ref(db, `posts/${postId}/comments`));
        await set(newCommentRef, commentData);
        
        // Award XP to the post author
        const articleSnapshot = await get(articleRef);
        const authorId = articleSnapshot.val()?.data?.author;
        if (authorId) {
            await update(ref(db, `users/${authorId}`), {
                xp: increment(INTERACTION_XP.COMMENT)
            });
        }

        // Update post ranking
        await updatePostRanking(postId);
        
        commentInput.value = '';
        await loadComments();
    } catch (error) {
        alert('Error posting comment. Please try again.');
    }
});

// Function to update post ranking
async function updatePostRanking(postId) {
    try {
        const articleRef = ref(db, `posts/${postId}`);
        const snapshot = await get(articleRef);
        const post = snapshot.val();

        if (!post) return;

        const rankingScore = calculatePostRanking({
            timestamp: post.data.timestamp,
            likes: post.data.likes || 0,
            comments: post.data.comments || [],
            views: post.data.views || 0
        });

        await update(articleRef, {
            'data/ranking': rankingScore
        });
    } catch (error) {
        console.error('Error updating post ranking:', error);
    }
}

// Function to calculate post ranking score
function calculatePostRanking(post) {
    const now = Date.now();
    const postAge = (now - post.timestamp) / (1000 * 60 * 60); // Hours
    const likes = post.likes || 0;
    const comments = (post.comments?.length || 0);
    const views = post.views || 0;

    return (likes * 3 + comments * 2 + views * 0.1) / Math.pow(postAge + 2, 1.5);
}

// Track reading time and award XP
let readStartTime = Date.now();
let hasAwardedReadXP = false;

window.addEventListener('beforeunload', async () => {
    if (hasAwardedReadXP || !auth.currentUser) return;

    try {
        const readTimeMinutes = Math.floor((Date.now() - readStartTime) / (1000 * 60));
        if (readTimeMinutes < 1) return;

        const articleRef = ref(db, `posts/${postId}`);
        const snapshot = await get(articleRef);
        const authorId = snapshot.val()?.data?.author;

        if (authorId) {
            const xpToAward = Math.min(
                readTimeMinutes * INTERACTION_XP.READ_TIME_PER_MINUTE,
                INTERACTION_XP.MAX_READ_TIME_XP
            );

            await update(ref(db, `users/${authorId}`), {
                xp: increment(xpToAward)
            });

            // Record read time
            await update(articleRef, {
                [`readTimeHistory/${auth.currentUser.uid}`]: {
                    timestamp: Date.now(),
                    duration: readTimeMinutes
                }
            });

            hasAwardedReadXP = true;
        }
    } catch (error) {
        console.error('Error awarding read time XP:', error);
    }
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadPost();
});

function formatTimeAgo(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''}`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

// Initialize when auth state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const isLiked = await checkUserLike(postId);
        loadPost();
    } else {
        loadPost();
    }
});

let startTime;
let readingInterval;
let totalReadTime = 0;
let isVisible = true;
let articleId;
let currentUser;
let hasRecordedView = false;

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
        totalReadTime += sessionTime;
    }
}

// Record view and initialize reading time tracking
async function recordView() {
    if (!articleId || hasRecordedView) return;

    try {
        const articleRef = ref(db, `posts/${articleId}/viewHistory`);
        const articleSnapshot = await get(articleRef);

        if (!articleSnapshot.exists()) return;

        const viewHistory = articleSnapshot.val() || [];
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
            await update(articleRef, {
                [Date.now()]: {
                    timestamp: Date.now(),
                    userId: currentUser?.uid || 'anonymous',
                    userAgent: navigator.userAgent
                }
            });

            // Update author's total views if this is a new view
            if (articleSnapshot.val()?.authorId && articleSnapshot.val()?.authorId !== currentUser?.uid) {
                const authorRef = ref(db, `users/${articleSnapshot.val()?.authorId}/totalViews`);
                await update(authorRef, {
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
        const articleRef = ref(db, `posts/${articleId}/readTimeHistory`);
        const articleSnapshot = await get(articleRef);

        if (!articleSnapshot.exists()) return;

        const readTimeInMinutes = Math.round(totalReadTime / 60);

        await update(articleRef, {
            [Date.now()]: {
                timestamp: Date.now(),
                userId: currentUser?.uid || 'anonymous',
                timeSpent: readTimeInMinutes,
                userAgent: navigator.userAgent
            }
        });

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

// Add shimmer effect in CSS
const style = document.createElement('style');
style.innerHTML = `
.shimmer {
    width: 100%;
    height: 200px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.1) 25%, rgba(255, 255, 255, 0.3) 50%, rgba(255, 255, 255, 0.1) 75%);
    background-size: 400% 100%;
    animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
    0% { background-position: 0% 0%; }
    100% { background-position: 100% 0%; }
}`; 
document.head.appendChild(style); 

// Add edit post functionality
window.editPost = async () => {
    if (!auth.currentUser) return;
    
    try {
        const articleRef = ref(db, `posts/${postId}`);
        const snapshot = await get(articleRef);
        const post = snapshot.val();
        
        if (post.data.author !== auth.currentUser.uid) {
            alert('You do not have permission to edit this post');
            return;
        }
        
        // Store post data in localStorage for the write page
        localStorage.setItem('editingPost', JSON.stringify({
            postId,
            title: post.data.title,
            content: post.data.content,
            category: post.data.category,
            themes: post.data.themes || [],
            thumbnail: post.data.thumbnail,
            tags: post.data.tags || [],
            seo: post.data.seo || {}
        }));
        
        // Redirect to write page
        window.location.href = 'write.html?edit=' + postId;
    } catch (error) {
        console.error('Error preparing post for edit:', error);
        alert('Failed to load post for editing');
    }
}; 