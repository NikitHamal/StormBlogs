// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAnuHbSv6BniMyf3ltSZTSrIFa_92bHB-o",
    authDomain: "storm-blogs.firebaseapp.com",
    projectId: "storm-blogs",
    storageBucket: "storm-blogs.firebasestorage.app",
    messagingSenderId: "158567556221",
    appId: "1:158567556221:web:855dfa074fc5b65e68fd14"
};

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

// Global state
let currentUser = null;
let editor = null;
let draftInterval = null;
let lastSavedContent = '';
let isPublishing = false;
let selectedThemes = new Set();

// Constants
const AUTOSAVE_INTERVAL = 30000; // 30 seconds
const DRAFT_KEY = 'blogDraft';
const MAX_TITLE_LENGTH = 100;
const MAX_THEMES = 5;
const MIN_CONTENT_LENGTH = 100;
const IMGBB_API_KEY = 'cae25a5efbe778e17c1db8b6f4e44cd7';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Editor Configuration
const EDITOR_CONFIG = {
    theme: 'snow',
    modules: {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
            [{ 'script': 'sub'}, { 'script': 'super' }],
            [{ 'indent': '-1'}, { 'indent': '+1' }],
            [{ 'direction': 'rtl' }],
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'color': [] }, { 'background': [] }],
            [{ 'font': [] }],
            [{ 'align': [] }],
            ['clean'],
            ['link', 'image', 'video']
        ],
        clipboard: {
            matchVisual: false
        }
    },
    placeholder: 'Start writing your story...',
    readOnly: false
};

// Initialize the editor and setup event listeners
function initializeEditor() {
    editor = new Quill('#editor', EDITOR_CONFIG);
    
    // Handle text change events
    editor.on('text-change', debounce(handleTextChange, 1000));
    
    // Handle image upload
    editor.getModule('toolbar').addHandler('image', handleImageUpload);
    
    // Setup theme handling
    setupThemeHandling();
    
    // Load draft if exists
    loadDraft();
    
    // Start autosave interval
    startAutosave();
}

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

        // Store image info in Firestore for tracking
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
        const imageDoc = doc(collection(db, `users/${currentUser.uid}/images`));
        await setDoc(imageDoc, {
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

    try {
        // Validate post
        const validationError = validatePost();
        if (validationError) {
            showNotification(validationError, 'error');
            return;
        }

        // Show loading state
        const publishButton = document.getElementById('publishButton');
        const originalText = publishButton.innerHTML;
        publishButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';
        publishButton.disabled = true;

        // Get post data
        const postData = await preparePostData();

        // Save to Firestore
        const postId = Date.now().toString();
        await setDoc(doc(db, "posts", postId), postData);

        // Clear draft
        localStorage.removeItem(DRAFT_KEY);

        // Redirect to the post
        window.location.href = `read.html?id=${postId}`;
    } catch (error) {
        console.error('Error publishing post:', error);
        showNotification('Failed to publish post', 'error');
        
        // Reset publish button
        const publishButton = document.getElementById('publishButton');
        publishButton.innerHTML = '<i class="fas fa-paper-plane"></i> Publish';
        publishButton.disabled = false;
    } finally {
        isPublishing = false;
    }
}

async function preparePostData() {
    const content = editor.root.innerHTML;
    const plainText = editor.getText().trim();
    
    // Get user data to include username
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const userData = userDoc.data();
    
    // Extract image URLs from content
    const imageUrls = extractImageUrls(content);
    
    // Update image docs with post ID
    if (imageUrls.length > 0) {
        try {
            const imagesQuery = collection(db, `users/${currentUser.uid}/images`);
            const snapshot = await getDocs(imagesQuery);
            snapshot.forEach(async (doc) => {
                const imageData = doc.data();
                if (imageUrls.includes(imageData.url)) {
                    await updateDoc(doc.ref, {
                        postId: Date.now().toString()
                    });
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
        authorId: currentUser.uid,
        authorName: userData.displayName || 'Anonymous',
        authorUsername: userData.username,
        authorEmail: currentUser.email,
        authorAvatar: currentUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.uid}`,
        category: document.getElementById('categoryInput').value,
        themes: Array.from(selectedThemes),
        timestamp: serverTimestamp(),
        lastModified: serverTimestamp(),
        status: 'published',
        readTime: Math.ceil(plainText.split(' ').length / 200),
        likes: 0,
        views: 0,
        likedBy: [],
        viewHistory: [],
        readTimeHistory: [],
        comments: [],
        shares: [],
        bookmarks: [],
        images: imageUrls
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

// Initialize
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        initializeEditor();
    } else {
        window.location.href = 'login.html';
    }
});

// Export functions for HTML event handlers
window.addTheme = addTheme;
window.removeTheme = removeTheme;
window.previewPost = previewPost;
window.publishPost = publishPost; 