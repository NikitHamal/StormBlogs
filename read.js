import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, get, update, child, increment } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";
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

    const articleRef = ref(db, `posts/${articleId}`);
    const userLikeRef = ref(db, `posts/${articleId}/likedBy/${auth.currentUser.uid}`);
    const snapshot = await get(userLikeRef);
    const hasLiked = snapshot.exists();

    if (hasLiked) {
        // Unlike
        await update(articleRef, {
            [`likedBy/${auth.currentUser.uid}`]: null,
            likes: increment(-1)
        });
    } else {
        // Like
        await update(articleRef, {
            [`likedBy/${auth.currentUser.uid}`]: true,
            likes: increment(1)
        });
    }

    // Update UI
    const likeButton = document.getElementById('likeButton');
    const likeCount = document.getElementById('likeCount');
    if (likeButton) {
        likeButton.classList.toggle('liked', !hasLiked);
    }
    if (likeCount) {
        const articleSnapshot = await get(articleRef);
        const likes = articleSnapshot.val()?.likes || 0;
        likeCount.textContent = likes;
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

// Add this function to handle Enter key submission
window.handleChatInput = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};
// Fetch the post from Realtime Database
const urlParams = new URLSearchParams(window.location.search);
const postId = urlParams.get('id');
console.log("Post ID from URL:", postId);

async function loadPost() {
    if (!postId) {
        console.error("No post ID provided");
        document.getElementById("article-content").innerHTML = "<p>Article not found</p>";
        return;
    }

    const articleRef = ref(db, `posts/${postId}`);
    try {
        const articleSnapshot = await get(articleRef);
        if (articleSnapshot.exists()) {
            const post = articleSnapshot.val();

            // Update page content
            document.getElementById("article-title").textContent = post.title;
            document.getElementById("article-title-b").textContent = post.title;
            document.getElementById("article-category").textContent = post.category;
            document.getElementById("article-time").textContent = formatTimeAgo(Date.now() - post.timestamp);

            // Display insights
            document.getElementById("like-count").textContent = post.likes || 0;
            document.getElementById("comment-count").textContent = post.comments ? post.comments.length : 0;
            document.getElementById("view-count").textContent = post.views || 0; // Assuming views are tracked

            // Format content
            const formattedContent = post.content
                .split('\n')
                .map(paragraph => paragraph.trim())
                .filter(paragraph => paragraph.length > 0)
                .map(paragraph => `<p style="margin-bottom: 1em;">${paragraph}</p>`)
                .join('');

            document.getElementById("article-body").innerHTML = formattedContent;

            // Update like button state
            const likeButton = document.getElementById("likeButton");
            if (auth.currentUser && post.likedBy && post.likedBy.includes(auth.currentUser.uid)) {
                likeButton.querySelector('i').classList.remove('far');
                likeButton.querySelector('i').classList.add('fas');
            }

            // Load comments
            await loadComments();

            // Update article context
            articleContext = `Title: ${post.title}\n\nContent: ${post.content}`;

            const authorPhotoURL = post.authorPhotoURL || 'default_profile.jpg'; // Use Realtime Database URL
            document.querySelector('img[alt="Profile"]').src = authorPhotoURL;
        }
    } catch (error) {
        console.error("Error loading post:", error);
        document.getElementById("article-content").innerHTML = "<p>Error loading article</p>";
    }
    // Initialize chat history
    chatHistory = [
        {
            role: "user",
            parts: [{ text: `ARTICLE CONTEXT: ${articleContext}` }]
        },
        {
            role: "model",
            parts: [{ text: 'I have read the article. Ask me anything!' }]
        }
    ];
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
    // ... rest of the code
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
    const comments = commentsSnapshot.val() || [];
    
    const commentsHtml = comments.map(comment => `
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
    
    document.getElementById('comments-list').innerHTML = commentsHtml;
    document.getElementById("comment-count").textContent = comments.length;
}

// Modify comment submission
document.getElementById('submit-comment').addEventListener('click', async () => {
    if (!auth.currentUser) {
        alert('Please login to comment');
        window.location.href = 'login.html';
        return;
    }

    const comment = document.getElementById('comment-input').value;
    if (!comment.trim()) return;
    
    try {
        const articleRef = ref(db, `posts/${postId}/comments`);
        await update(articleRef, {
            [Date.now()]: {
                text: comment,
                timestamp: Date.now(),
                userId: auth.currentUser.uid,
                userName: auth.currentUser.displayName || auth.currentUser.email.split('@')[0],
                userPhotoURL: auth.currentUser.photoURL
            }
        });
        
        document.getElementById('comment-input').value = '';
        // Refresh comments immediately
        await loadComments();
    } catch (error) {
        console.error("Error posting comment:", error);
        alert('Error posting comment. Please try again.');
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

function renderArticle(data) {
    // Set category
    document.getElementById('articleCategory').textContent = data.category || '';
    
    // Set title
    document.getElementById('articleTitle').textContent = data.title;
    
    // Set author and date
    document.getElementById('authorName').textContent = data.authorName || 'Anonymous';
    document.getElementById('publishDate').textContent = new Date(data.timestamp.toDate()).toLocaleDateString();
    
    // Set content
    const contentDiv = document.getElementById('articleContent');
    contentDiv.innerHTML = data.content;

    // Render tags
    const tagsContainer = document.getElementById('articleTags');
    tagsContainer.innerHTML = '';
    if (data.themes && data.themes.length > 0) {
        data.themes.forEach(theme => {
            const tag = document.createElement('div');
            tag.className = 'tag';
            tag.textContent = theme;
            tagsContainer.appendChild(tag);
        });
    }

    // Set like count
    const likeCount = document.getElementById('likeCount');
    likeCount.textContent = data.likes ? data.likes.length : 0;

    // Set comment count
    const commentCount = document.getElementById('commentCount');
    commentCount.textContent = data.comments ? data.comments.length : 0;

    // Update like button state
    const likeButton = document.getElementById('likeButton');
    if (auth.currentUser && data.likes && data.likes.includes(auth.currentUser.uid)) {
        likeButton.querySelector('i').classList.remove('far');
        likeButton.querySelector('i').classList.add('fas');
    }
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
        totalReadTime = sessionTime;
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