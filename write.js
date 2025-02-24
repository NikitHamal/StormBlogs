// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-app.js";
import { getDatabase, ref, get, set, update, push, serverTimestamp, increment, runTransaction } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-storage.js";
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
const storage = getStorage(app);
const genAI = new GoogleGenerativeAI("AIzaSyACk4YyXgd_VOvBlFWV8r17LuwkT1iGfmg");
const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: {
        parts: [{ text: "You are an expert assistant for this article." }]
    }
});

// Global state
let currentUser = null;
let editor = null;
let draftInterval = null;
let lastSavedContent = '';
let isPublishing = false;
let selectedThemes = new Set();
let articleContext = '';
let chatHistory = [];
let editingPostId = null;

// Constants
const AUTOSAVE_INTERVAL = 30000; // 30 seconds
const DRAFT_KEY = 'blogDraft';
const MAX_TITLE_LENGTH = 100;
const MAX_THEMES = 5;
const MIN_CONTENT_LENGTH = 100;
const IMGBB_API_KEY = 'cae25a5efbe778e17c1db8b6f4e44cd7';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Experience and Level Constants
const XP_CONSTANTS = {
    BASE_POST_XP: 50,
    WORDS_PER_XP: 20,
    FIRST_POST_XP: 100,
    MAX_XP_PER_POST: 500
};

const LEVEL_THRESHOLDS = [
    0,      // Level 1
    100,    // Level 2
    300,    // Level 3
    600,    // Level 4
    1000,   // Level 5
    1500,   // Level 6
    2100,   // Level 7
    2800,   // Level 8
    3600,   // Level 9
    4500    // Level 10
];

const AI_LIMITS = {
    1: 5,   // Level 1: 5 calls per day
    2: 8,   // Level 2: 8 calls per day
    3: 10,  // Level 3: 10 calls per day
    4: 15,  // Level 4: 15 calls per day
    5: 20,  // Level 5: 20 calls per day
    6: 25,  // Level 6: 25 calls per day
    7: 30,  // Level 7: 30 calls per day
    8: 40,  // Level 8: 40 calls per day
    9: 50,  // Level 9: 50 calls per day
    10: -1  // Level 10: Unlimited
};

const ACHIEVEMENTS = {
    FIRST_POST: {
        id: 'first_post',
        title: 'First Steps',
        description: 'Published your first post',
        xp: 100,
        icon: '📝'
    },
    LEVEL_5: {
        id: 'level_5',
        title: 'Rising Star',
        description: 'Reached Level 5',
        xp: 200,
        icon: '⭐'
    },
    LEVEL_10: {
        id: 'level_10',
        title: 'Master Writer',
        description: 'Reached Level 10',
        xp: 500,
        icon: '👑'
    },
    POSTS_10: {
        id: 'posts_10',
        title: 'Prolific Writer',
        description: 'Published 10 posts',
        xp: 300,
        icon: '✍️'
    },
    LONG_POST: {
        id: 'long_post',
        title: 'Novelist',
        description: 'Published a post with over 2000 words',
        xp: 200,
        icon: '📚'
    }
};

// DOM Elements
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const thumbnailPreview = document.getElementById('thumbnailPreview');
const thumbnailInput = document.getElementById('thumbnailInput');
const uploadThumbnailBtn = document.getElementById('uploadThumbnailBtn');
const tagInput = document.getElementById('tagInput');
const tagsContainer = document.getElementById('tagsContainer');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const sendMessageBtn = document.getElementById('sendMessage');

// State
let selectedThumbnail = null;
let tags = new Set();
let thumbnailUrl = '';

// Initialize Quill editor and other functionalities when user is authenticated
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Initialize Quill editor first
        editor = new Quill('#editor', {
            theme: 'snow',
            placeholder: 'Write your story here...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    ['blockquote', 'code-block'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'script': 'sub'}, { 'script': 'super' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'direction': 'rtl' }],
                    [{ 'size': ['small', 'normal', 'large', 'huge'] }],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'font': ['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'Roboto', 'Lato', 'Montserrat', 'Open Sans', 'Raleway', 'Poppins'] }],
                    [{ 'align': [] }],
                    ['clean'],
                    ['link', 'image']
                ]
            }
        });
        
        // Check if we're editing a post
        const urlParams = new URLSearchParams(window.location.search);
        editingPostId = urlParams.get('edit');
        
        if (editingPostId) {
            try {
                const editData = JSON.parse(localStorage.getItem('editingPost'));
                if (editData && editData.postId === editingPostId) {
                    // Load post data into editor
                    document.getElementById('titleInput').value = editData.title;
                    editor.root.innerHTML = editData.content;
                    document.getElementById('categoryInput').value = editData.category;
                    selectedThemes = new Set(editData.themes);
                    renderThemes();
                    
                    // Load thumbnail
                    if (editData.thumbnail) {
                        thumbnailUrl = editData.thumbnail;
                        thumbnailPreview.style.backgroundImage = `url(${thumbnailUrl})`;
                        thumbnailPreview.innerHTML = '';
                    }
                    
                    // Load tags
                    if (editData.tags) {
                        tags = new Set(editData.tags);
                        tags.forEach(tag => {
                            const tagElement = document.createElement('div');
                            tagElement.className = 'tag';
                            tagElement.innerHTML = `
                                <span>${tag}</span>
                                <i class="fas fa-times" onclick="removeTag('${tag}')"></i>
                            `;
                            tagsContainer.appendChild(tagElement);
                        });
                    }
                    
                    // Load SEO settings
                    if (editData.seo) {
                        document.getElementById('metaTitle').value = editData.seo.metaTitle || '';
                        document.getElementById('metaDescription').value = editData.seo.metaDescription || '';
                        document.getElementById('focusKeyword').value = editData.seo.focusKeyword || '';
                        document.getElementById('canonicalUrl').value = editData.seo.canonicalUrl || '';
                    }
                    
                    // Update publish button text
                    document.getElementById('publishButton').textContent = 'Update Post';
                }
            } catch (error) {
                console.error('Error loading post for editing:', error);
                showNotification('Failed to load post for editing', 'error');
            }
        }
        
        // Use MutationObserver for scroll container
        const container = editor.scrollingContainer;
        const observer = new MutationObserver(() => {
            editor.update();
        });
        observer.observe(container, {
            childList: true,
            subtree: true
        });

        // Handle image upload
        editor.getModule('toolbar').addHandler('image', async () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', ALLOWED_IMAGE_TYPES.join(','));
            input.click();

            input.onchange = async () => {
                const file = input.files[0];
                if (!file) return;

                try {
                    // Validate file
                    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                        throw new Error('Invalid image type. Please use JPG, PNG, GIF, or WebP.');
                    }
                    if (file.size > MAX_IMAGE_SIZE) {
                        throw new Error('Image size too large. Maximum size is 5MB.');
                    }

                    // Show loading state in editor
                    const range = editor.getSelection(true);
                    editor.insertEmbed(range.index, 'image', 'loading.gif');
                    editor.insertText(range.index + 1, '\n');

                    // Upload to ImgBB
                    const imageUrl = await uploadToImgBB(file);
                    
                    // Replace loading image with actual image
                    const [leaf, offset] = editor.getLeaf(range.index);
                    const imageIndex = editor.getIndex(leaf);
                    editor.deleteText(imageIndex, 2); // Delete loading image and newline
                    editor.insertEmbed(imageIndex, 'image', imageUrl);
                    editor.insertText(imageIndex + 1, '\n');

                    // Save draft after successful upload
                    saveDraft();
                } catch (error) {
                    console.error('Image upload failed:', error);
                    showNotification(error.message || 'Failed to upload image', 'error');
                    
                    // Remove loading image if it exists
                    try {
                        const [leaf, offset] = editor.getLeaf(range.index);
                        const imageIndex = editor.getIndex(leaf);
                        editor.deleteText(imageIndex, 2);
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                }
            };
        });

        // Auto-save functionality
        let autoSaveTimeout;
        editor.on('text-change', () => {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(saveProgress, 2000);
        });

        // Initialize theme handling
        setupThemeHandling();

        // Load draft if exists
        loadDraft();

        // AI Tools Integration
        const aiToolButtons = document.querySelectorAll('.ai-tool-btn');
        aiToolButtons.forEach(button => {
            button.addEventListener('click', async () => {
                const action = button.getAttribute('data-action');
                await handleAiToolAction(action);
            });
        });
    } else {
        window.location.href = 'login.html';
    }
});

// Theme handling
function setupThemeHandling() {
    const themeInput = document.getElementById('themeInput');
    const themeTags = document.getElementById('themeTags');

    themeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.value.trim()) {
            e.preventDefault();
            addTheme(e.target.value.trim());
            e.target.value = '';
        }
    });
}

function addTheme(theme) {
    if (selectedThemes.size >= MAX_THEMES) {
        showNotification(`Maximum ${MAX_THEMES} themes allowed`, 'warning');
        return;
    }
    
    if (!selectedThemes.has(theme)) {
        selectedThemes.add(theme);
        renderThemes();
    }
}

function removeTheme(theme) {
    selectedThemes.delete(theme);
    renderThemes();
}

function renderThemes() {
    const container = document.getElementById('themeTags');
    container.innerHTML = '';
    
    selectedThemes.forEach(theme => {
        const tag = document.createElement('div');
        tag.className = 'theme-tag';
        tag.innerHTML = `
            ${theme}
            <i class="fas fa-times" onclick="removeTheme('${theme}')"></i>
        `;
        container.appendChild(tag);
    });
}

// Draft handling
function saveDraft() {
    const content = {
        title: document.getElementById('titleInput').value,
        content: editor.root.innerHTML,
        category: document.getElementById('categoryInput').value,
        themes: Array.from(selectedThemes),
        lastSaved: new Date().toISOString()
    };
    
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(content));
        showSaveIndicator();
    } catch (error) {
        console.error('Error saving draft:', error);
        showNotification('Failed to save draft', 'error');
    }
}

function saveProgress() {
    const content = {
        title: document.getElementById('titleInput').value,
        content: editor.root.innerHTML,
        category: document.getElementById('categoryInput').value,
        themes: Array.from(selectedThemes),
        lastSaved: new Date().toISOString()
    };

    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(content));
        showSaveIndicator();
    } catch (error) {
        console.error('Error saving draft:', error);
        showNotification('Failed to save draft', 'error');
    }
}

function loadDraft() {
    try {
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) {
            const content = JSON.parse(draft);
            document.getElementById('titleInput').value = content.title || '';
            editor.root.innerHTML = content.content || '';
            document.getElementById('categoryInput').value = content.category || '';
            selectedThemes = new Set(content.themes || []);
            renderThemes();
        }
    } catch (error) {
        console.error('Error loading draft:', error);
        showNotification('Failed to load draft', 'error');
    }
}

// Image handling
async function handleImageUpload() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', ALLOWED_IMAGE_TYPES.join(','));
    input.click();

    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;

        try {
            // Validate file
            if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                throw new Error('Invalid image type. Please use JPG, PNG, GIF, or WebP.');
            }
            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error('Image size too large. Maximum size is 5MB.');
            }

            // Show loading state in editor
            const range = editor.getSelection(true);
            const loadingId = 'img-' + Date.now();
            editor.insertEmbed(range.index, 'image', 'loading.gif');
            editor.insertText(range.index + 1, '\n');

            // Upload to ImgBB
            const imageUrl = await uploadToImgBB(file);
            
            // Replace loading image with actual image
            const [leaf, offset] = editor.getLeaf(range.index);
            const imageIndex = editor.getIndex(leaf);
            editor.deleteText(imageIndex, 2); // Delete loading image and newline
            editor.insertEmbed(imageIndex, 'image', imageUrl);
            editor.insertText(imageIndex + 1, '\n');

            // Save draft after successful upload
            saveDraft();

        } catch (error) {
            console.error('Image upload failed:', error);
            showNotification(error.message || 'Failed to upload image', 'error');
            
            // Remove loading image if it exists
            try {
                const [leaf, offset] = editor.getLeaf(range.index);
                const imageIndex = editor.getIndex(leaf);
                editor.deleteText(imageIndex, 2);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    };
}

async function uploadToImgBB(file) {
    try {
        // Optimize image if needed
        const optimizedFile = await optimizeImage(file);
        
        // Prepare form data
        const formData = new FormData();
        formData.append('image', optimizedFile);
        
        // Upload to ImgBB
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload to ImgBB');
        }

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error?.message || 'Upload failed');
        }

        // Store image info in Realtime Database for tracking
        await storeImageInfo({
            url: data.data.url,
            deleteUrl: data.data.delete_url,
            thumb: data.data.thumb?.url,
            size: file.size,
            timestamp: new Date().toISOString(),
            postId: null // Will be updated when post is published
        });

        return data.data.url;
    } catch (error) {
        console.error('ImgBB upload error:', error);
        throw new Error('Failed to upload image. Please try again.');
    }
}

async function optimizeImage(file) {
    return new Promise((resolve, reject) => {
        // If file is small enough, return as is
        if (file.size <= MAX_IMAGE_SIZE) {
            resolve(file);
            return;
        }

        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        img.onload = () => {
            // Calculate new dimensions while maintaining aspect ratio
            let { width, height } = calculateOptimizedDimensions(img, 1920); // Max width 1920px

            canvas.width = width;
            canvas.height = height;

            // Draw and compress image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to blob
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        // Create new file from blob
                        const optimizedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(optimizedFile);
                    } else {
                        reject(new Error('Failed to optimize image'));
                    }
                },
                'image/jpeg',
                0.8 // Quality
            );
        };

        img.onerror = () => reject(new Error('Failed to load image for optimization'));
        img.src = URL.createObjectURL(file);
    });
}

function calculateOptimizedDimensions(img, maxWidth) {
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
    }

    return { width, height };
}

async function storeImageInfo(imageInfo) {
    try {
        // Store in user's images collection
        const imageRef = ref(db, `users/${currentUser.uid}/images/${Date.now()}`);
        await set(imageRef, {
            ...imageInfo,
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Anonymous'
        });
    } catch (error) {
        console.error('Error storing image info:', error);
        // Don't throw error as this is not critical
    }
}

// Publishing
async function publishPost() {
    if (isPublishing) return;
    isPublishing = true;

    const publishButton = document.getElementById('publishButton');
    const originalButtonHtml = publishButton.innerHTML;
    
    try {
        if (!currentUser || !currentUser.emailVerified) {
            alert('Please verify your email before publishing posts.');
            return;
        }

        const validationError = validatePost();
        if (validationError) {
            showNotification(validationError, 'error');
            return;
        }

        publishButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (editingPostId ? 'Updating...' : 'Publishing...');
        publishButton.disabled = true;

        const postData = await preparePostData();
        
        if (!postData.author) {
            throw new Error('Please log in to publish posts.');
        }

        const rankingScore = calculatePostRanking({
            timestamp: Date.now(),
            likes: 0,
            comments: [],
            views: 0
        });

        const postRef = ref(db, `posts/${editingPostId || Date.now().toString()}`);
        
        if (editingPostId) {
            // Update existing post
            await update(postRef, {
                data: {
                    ...postData,
                    lastModified: serverTimestamp()
                }
            });
            
            showNotification('Post updated successfully!', 'success');
        } else {
            // Create new post
            await set(postRef, {
                data: {
                    ...postData,
                    ranking: rankingScore
                }
            });

            // Award XP for new post
            const wordCount = postData.plainText.split(/\s+/).length;
            const postXP = calculatePostXP(wordCount);

            await runTransaction(ref(db, `users/${currentUser.uid}`), (userData) => {
                if (!userData) userData = {};
                if (!userData.stats) userData.stats = {};
                
                userData.xp = (userData.xp || 0) + postXP;
                userData.stats.totalPosts = (userData.stats.totalPosts || 0) + 1;
                userData.stats.totalWords = (userData.stats.totalWords || 0) + wordCount;
                
                return userData;
            });

            await checkAchievements(currentUser.uid, postData);
            showNotification(`+${postXP} XP earned for this post!`, 'success');
        }

        // Clear draft and redirect
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem('editingPost');
        window.location.href = `read.html?id=${editingPostId || postRef.key}`;
    } catch (error) {
        console.error('Error publishing post:', error);
        showNotification('Failed to publish post', 'error');
        
        publishButton.innerHTML = originalButtonHtml;
        publishButton.disabled = false;
    } finally {
        isPublishing = false;
    }
}

async function preparePostData() {
    const content = editor.root.innerHTML;
    const plainText = editor.getText().trim();
    
    // Extract image URLs from content
    const imageUrls = extractImageUrls(content);
    
    // Update image docs with post ID
    if (imageUrls.length > 0) {
        try {
            const imagesRef = ref(db, `users/${currentUser.uid}/images`);
            const snapshot = await get(imagesRef);
            const images = snapshot.val();
            imageUrls.forEach(url => {
                if (images[url]) {
                    update(ref(db, `users/${currentUser.uid}/images/${url}/postId`), Date.now().toString());
                }
            });
        } catch (error) {
            console.error('Error updating image docs:', error);
        }
    }
    
    return {
        title: document.getElementById('titleInput').value.trim(),
        content,
        plainText,
        author: currentUser.uid,
        category: document.getElementById('categoryInput').value,
        themes: Array.from(selectedThemes),
        timestamp: serverTimestamp(),
        lastModified: serverTimestamp(),
        status: 'published',
        readTime: Math.ceil(plainText.split(' ').length / 200),
        likes: 0,
        views: 0,
        likedBy: [],
        comments: [],
        images: imageUrls,
        thumbnail: thumbnailUrl,
        tags: Array.from(tags),
        seo: {
            metaTitle: document.getElementById('metaTitle').value.trim(),
            metaDescription: document.getElementById('metaDescription').value.trim(),
            focusKeyword: document.getElementById('focusKeyword').value.trim(),
            canonicalUrl: document.getElementById('canonicalUrl').value.trim()
        }
    };
}

function extractImageUrls(content) {
    const urls = [];
    const div = document.createElement('div');
    div.innerHTML = content;
    
    div.querySelectorAll('img').forEach(img => {
        if (img.src && !img.src.includes('loading.gif')) {
            urls.push(img.src);
        }
    });
    
    return urls;
}

function validatePost() {
    const title = document.getElementById('titleInput').value.trim();
    const category = document.getElementById('categoryInput').value;
    const content = editor.getText().trim();

    if (!title) return 'Please enter a title';
    if (title.length > MAX_TITLE_LENGTH) return `Title must be less than ${MAX_TITLE_LENGTH} characters`;
    if (!category) return 'Please select a category';
    if (content.length < MIN_CONTENT_LENGTH) return `Content must be at least ${MIN_CONTENT_LENGTH} characters`;
    if (selectedThemes.size === 0) return 'Please add at least one theme';
    
    return null;
}

// Preview functionality
function previewPost() {
    saveDraft();
    const previewWindow = window.open('', '_blank');
    const content = editor.root.innerHTML;
    const title = document.getElementById('titleInput').value;
    
    previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Preview - ${title}</title>
                <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
                <link href="https://cdn.quilljs.com/1.3.6/quill.snow.css" rel="stylesheet">
                <style>
                    body { 
                        font-family: 'Poppins', sans-serif;
                        max-width: 800px;
                        margin: 40px auto;
                        padding: 20px;
                        line-height: 1.8;
                    }
                    h1 { font-size: 2.5rem; margin-bottom: 30px; }
                    .preview-meta {
                        color: #666;
                        margin-bottom: 30px;
                    }
                    .theme-tags {
                        display: flex;
                        gap: 10px;
                        margin-top: 10px;
                    }
                    .theme-tag {
                        background: #f0f0f0;
                        padding: 5px 10px;
                        border-radius: 15px;
                        font-size: 0.9rem;
                    }
                </style>
            </head>
            <body>
                <h1>${title}</h1>
                <div class="preview-meta">
                    <div>Category: ${document.getElementById('categoryInput').value}</div>
                    <div class="theme-tags">
                        ${Array.from(selectedThemes).map(theme => 
                            `<span class="theme-tag">${theme}</span>`
                        ).join('')}
                    </div>
                </div>
                <div class="ql-editor">${content}</div>
            </body>
        </html>
    `);
    previewWindow.document.close();
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function handleTextChange(delta, oldDelta, source) {
    if (source === 'user') {
        const content = editor.root.innerHTML;
        if (content !== lastSavedContent) {
            saveDraft();
            lastSavedContent = content;
        }
    }
}

function showNotification(message, type = 'success') {
    const toast = document.getElementById('saveIndicator');
    toast.className = `save-indicator ${type}`;
    toast.querySelector('span').textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showSaveIndicator() {
    showNotification('Changes saved');
}

function startAutosave() {
    if (draftInterval) clearInterval(draftInterval);
    draftInterval = setInterval(saveDraft, AUTOSAVE_INTERVAL);
}

// Export functions for HTML event handlers
window.addTheme = addTheme;
window.removeTheme = removeTheme;
window.previewPost = previewPost;
window.publishPost = publishPost;

// Function to calculate level from XP
function calculateLevel(xp) {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp >= LEVEL_THRESHOLDS[i]) {
            level = i + 1;
        } else {
            break;
        }
    }
    return level;
}

// Function to calculate XP for a post
function calculatePostXP(wordCount) {
    const baseXP = XP_CONSTANTS.BASE_POST_XP;
    const wordXP = Math.floor(wordCount / XP_CONSTANTS.WORDS_PER_XP);
    return Math.min(baseXP + wordXP, XP_CONSTANTS.MAX_XP_PER_POST);
}

// Function to check and award achievements
async function checkAchievements(userId, postData) {
    const userRef = ref(db, `users/${userId}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val() || {};
    const achievements = userData.achievements || {};
    const stats = userData.stats || {};
    const newAchievements = [];

    // First post achievement
    if (!achievements.FIRST_POST && stats.totalPosts === 1) {
        newAchievements.push(ACHIEVEMENTS.FIRST_POST);
    }

    // Level achievements
    const currentLevel = calculateLevel(userData.xp || 0);
    if (currentLevel >= 5 && !achievements.LEVEL_5) {
        newAchievements.push(ACHIEVEMENTS.LEVEL_5);
    }
    if (currentLevel >= 10 && !achievements.LEVEL_10) {
        newAchievements.push(ACHIEVEMENTS.LEVEL_10);
    }

    // Posts count achievement
    if (stats.totalPosts >= 10 && !achievements.POSTS_10) {
        newAchievements.push(ACHIEVEMENTS.POSTS_10);
    }

    // Long post achievement
    const wordCount = postData.plainText.split(/\s+/).length;
    if (wordCount > 2000 && !achievements.LONG_POST) {
        newAchievements.push(ACHIEVEMENTS.LONG_POST);
    }

    // Award new achievements
    if (newAchievements.length > 0) {
        const updates = {};
        let totalXP = 0;

        newAchievements.forEach(achievement => {
            updates[`achievements/${achievement.id}`] = achievement;
            totalXP += achievement.xp;
        });

        // Update user data
        await update(userRef, {
            ...updates,
            xp: increment(totalXP)
        });

        // Show achievement notifications
        newAchievements.forEach(achievement => {
            showAchievementNotification(achievement);
        });
    }
}

// Function to show achievement notification
function showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-details">
            <h3>${achievement.title}</h3>
            <p>${achievement.description}</p>
            <span>+${achievement.xp} XP</span>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Function to calculate post ranking score
function calculatePostRanking(post) {
    const now = Date.now();
    const postAge = (now - post.timestamp) / (1000 * 60 * 60); // Hours
    const likes = post.likes || 0;
    const comments = (post.comments?.length || 0);
    const views = post.views || 0;

    // Ranking formula: (likes * 3 + comments * 2 + views * 0.1) / (age + 2)^1.5
    return (likes * 3 + comments * 2 + views * 0.1) / Math.pow(postAge + 2, 1.5);
}

// Add AI usage tracking
let dailyAIUsage = 0;
const AI_USAGE_KEY = `aiUsage_${currentUser?.uid}_${new Date().toDateString()}`;

async function checkAIUsageLimit() {
    if (!currentUser) return false;

    try {
        // Get user level
        const userRef = ref(db, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};
        const userLevel = calculateLevel(userData.xp || 0);
        const dailyLimit = AI_LIMITS[userLevel] || AI_LIMITS[1];

        // Get today's usage
        const usageData = localStorage.getItem(AI_USAGE_KEY);
        dailyAIUsage = usageData ? parseInt(usageData) : 0;

        // Check if limit reached
        if (dailyLimit !== -1 && dailyAIUsage >= dailyLimit) {
            showNotification(`Daily AI limit reached. Reach level ${userLevel + 1} for more!`, 'error');
            return false;
        }

        // Increment usage
        dailyAIUsage++;
        localStorage.setItem(AI_USAGE_KEY, dailyAIUsage.toString());
        return true;
    } catch (error) {
        console.error('Error checking AI usage:', error);
        return false;
    }
}

// Update AI tool handlers to check limits
async function handleAiToolAction(action) {
    if (!await checkAIUsageLimit()) {
        return;
    }
    // ... existing AI tool handling code ...
}

// Initialize editor
document.addEventListener('DOMContentLoaded', () => {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    // Toggle sidebar
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('active');
        sidebarToggle.classList.toggle('active');
    });

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && 
            !sidebarToggle.contains(e.target) && 
            sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            sidebarToggle.classList.remove('active');
        }
    });

    // Prevent clicks inside sidebar from closing it
    sidebar.addEventListener('click', (e) => {
        e.stopPropagation();
    });
});

// Tab Switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    });
});

// Thumbnail Upload
thumbnailPreview.addEventListener('click', () => {
    thumbnailInput.click();
});

uploadThumbnailBtn.addEventListener('click', () => {
    thumbnailInput.click();
});

thumbnailInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // Show loading state
        thumbnailPreview.innerHTML = `
            <div class="loading-overlay">
                <div class="loading-spinner"></div>
            </div>
        `;

        // Optimize image if needed
        const optimizedFile = await optimizeImage(file);
        
        // Upload to ImgBB
        const formData = new FormData();
        formData.append('image', optimizedFile);
        
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload to ImgBB');
        }

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error?.message || 'Upload failed');
        }

        // Update preview and store URL
        thumbnailUrl = data.data.url;
        thumbnailPreview.style.backgroundImage = `url(${thumbnailUrl})`;
        thumbnailPreview.innerHTML = '';

        // Store image info
        await storeImageInfo({
            url: data.data.url,
            deleteUrl: data.data.delete_url,
            thumb: data.data.thumb?.url,
            size: file.size,
            timestamp: new Date().toISOString(),
            type: 'thumbnail'
        });

        showNotification('Thumbnail uploaded successfully!');
    } catch (error) {
        console.error('Error uploading thumbnail:', error);
        thumbnailPreview.innerHTML = `
            <i class="fas fa-image"></i>
            <span>Add Thumbnail</span>
        `;
        showNotification('Failed to upload thumbnail', 'error');
    }
});

// Tags Management
tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const tagText = tagInput.value.trim();
        if (tagText && !tagText.includes(' ')) {
            addTag(tagText.startsWith('#') ? tagText : `#${tagText}`);
            tagInput.value = '';
        }
    }
});

function addTag(tagText) {
    if (tags.has(tagText)) return;
    tags.add(tagText);

    const tagElement = document.createElement('div');
    tagElement.className = 'tag';
    tagElement.innerHTML = `
        <span>${tagText}</span>
        <i class="fas fa-times" onclick="removeTag('${tagText}')"></i>
    `;
    tagsContainer.appendChild(tagElement);
}

function removeTag(tagText) {
    tags.delete(tagText);
    const tagElements = tagsContainer.querySelectorAll('.tag');
    tagElements.forEach(el => {
        if (el.querySelector('span').textContent === tagText) {
            el.remove();
        }
    });
}

// Chat Functionality
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    try {
        // Add user message
        addMessageToChat('user', message);
        chatInput.value = '';

        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'chat-message ai typing';
        typingIndicator.innerHTML = '<div class="loading-spinner"></div>';
        chatMessages.appendChild(typingIndicator);

        // Get AI response
        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                maxOutputTokens: 1000,
            }
        });

        const result = await chat.sendMessage(message);
        const response = await result.response.text();

        // Remove typing indicator and add AI response
        typingIndicator.remove();
        addMessageToChat('ai', response);

        // Update chat history
        chatHistory.push(
            { role: 'user', parts: [{ text: message }] },
            { role: 'model', parts: [{ text: response }] }
        );

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('Error sending message:', error);
        typingIndicator?.remove();
        showNotification('Failed to get AI response', 'error');
    }
}

function addMessageToChat(type, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    messageDiv.textContent = content;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
} 