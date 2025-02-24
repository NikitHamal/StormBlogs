// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-app.js";
import { getDatabase, ref, query, orderByChild, get, limitToLast } from "https://www.gstatic.com/firebasejs/9.8.4/firebase-database.js";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const searchInput = document.querySelector('.search-input');
const filterButton = document.querySelector('.filter-button');
const categoriesContainer = document.querySelector('.categories');
const articlesGrid = document.querySelector('.articles-grid');
const loadMoreButton = document.getElementById('load-more');

// State
let currentPage = 1;
let currentCategory = '';
let currentSearch = '';
let isLoading = false;
let hasMoreArticles = true;
let lastLoadedTimestamp = null;

// Constants
const ARTICLES_PER_PAGE = 9;
const DEBOUNCE_DELAY = 300;

// Utility Functions
const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
};

const showLoading = () => {
    isLoading = true;
    const loader = document.createElement('div');
    loader.className = 'loading';
    loader.innerHTML = '<div class="loading-spinner"></div>';
    articlesGrid.appendChild(loader);
};

const hideLoading = () => {
    isLoading = false;
    const loader = document.querySelector('.loading');
    if (loader) loader.remove();
};

// Article Card Template
const createArticleCard = async (article) => {
    // Fetch author details from correct path
    const authorRef = ref(db, `users/${article.data.author}`);
    const authorSnapshot = await get(authorRef);
    const authorData = authorSnapshot.val() || {};

    const card = document.createElement('div');
    card.className = 'article-card';
    card.innerHTML = `
        ${article.data.images?.[0] ? `
            <img src="${article.data.images[0]}" alt="${article.data.title}" class="article-image">
        ` : ''}
        <div class="article-content">
            <div class="article-category">${article.data.category}</div>
            <h2 class="article-title">${article.data.title}</h2>
            <p class="article-preview">${article.data.plainText?.substring(0, 150)}...</p>
            <div class="article-meta">
                <div class="article-author">
                    <img src="${authorData.photoURL || 'https://i.pravatar.cc/150?u=default'}" alt="${authorData.displayName || 'Anonymous'}" class="author-avatar">
                    <span>${authorData.displayName || 'Anonymous'}</span>
                </div>
                <div class="article-date">${new Date(article.data.timestamp).toLocaleDateString()}</div>
            </div>
            <div class="article-actions">
                <div class="action-buttons">
                    <div class="action-button">
                        <i class="far fa-heart"></i>
                        <span>${article.data.likes || 0}</span>
                    </div>
                    <div class="action-button">
                        <i class="far fa-comment"></i>
                        <span>${article.data.comments?.length || 0}</span>
                    </div>
                </div>
                <div class="action-button">
                    <i class="far fa-bookmark"></i>
                </div>
            </div>
        </div>
    `;

    // Add click event to navigate to article
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.action-button')) {
            window.location.href = `read.html?id=${article.id}`;
        }
    });

    // Add interaction events for action buttons
    const likeButton = card.querySelector('.fa-heart').parentElement;
    const commentButton = card.querySelector('.fa-comment').parentElement;
    const bookmarkButton = card.querySelector('.fa-bookmark').parentElement;

    likeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        likeButton.querySelector('i').classList.toggle('fas');
        likeButton.querySelector('i').classList.toggle('far');
        const count = likeButton.querySelector('span');
        count.textContent = parseInt(count.textContent) + (likeButton.querySelector('i').classList.contains('fas') ? 1 : -1);
    });

    commentButton.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `read.html?id=${article.id}#comments`;
    });

    bookmarkButton.addEventListener('click', (e) => {
        e.stopPropagation();
        bookmarkButton.querySelector('i').classList.toggle('fas');
        bookmarkButton.querySelector('i').classList.toggle('far');
    });

    return card;
};

// API Functions
const fetchArticles = async (page = 1, category = '', search = '') => {
    try {
        const articlesRef = ref(db, 'posts');
        const snapshot = await get(articlesRef);
        let articles = [];

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const article = {
                    id: childSnapshot.key,
                    ...childSnapshot.val()
                };
                articles.push(article);
            });

            // Sort by ranking score (highest first)
            articles.sort((a, b) => {
                const rankingA = calculatePostRanking({
                    timestamp: a.data.timestamp,
                    likes: a.data.likes || 0,
                    comments: a.data.comments || [],
                    views: a.data.views || 0
                });
                const rankingB = calculatePostRanking({
                    timestamp: b.data.timestamp,
                    likes: b.data.likes || 0,
                    comments: b.data.comments || [],
                    views: b.data.views || 0
                });
                return rankingB - rankingA;
            });

            // Filter by category if specified
            if (category) {
                articles = articles.filter(article => 
                    article.data.category.toLowerCase() === category.toLowerCase()
                );
            }

            // Filter by search if specified
            if (search) {
                const searchLower = search.toLowerCase();
                articles = articles.filter(article => 
                    article.data.title.toLowerCase().includes(searchLower) ||
                    article.data.plainText.toLowerCase().includes(searchLower)
                );
            }

            // Handle pagination
            const startIndex = (page - 1) * ARTICLES_PER_PAGE;
            const endIndex = startIndex + ARTICLES_PER_PAGE;
            const paginatedArticles = articles.slice(startIndex, endIndex);

            return {
                articles: paginatedArticles,
                hasMore: endIndex < articles.length
            };
        }

        return { articles: [], hasMore: false };
    } catch (error) {
        console.error('Error fetching articles:', error);
        throw error;
    }
};

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

const loadArticles = async (reset = false) => {
    if (isLoading) return;

    if (reset) {
        currentPage = 1;
        lastLoadedTimestamp = null;
        articlesGrid.innerHTML = '';
        hasMoreArticles = true;
    }

    showLoading();

    try {
        const { articles, hasMore } = await fetchArticles(currentPage, currentCategory, currentSearch);
        
        if (articles.length === 0 && currentPage === 1) {
            articlesGrid.innerHTML = '<div class="no-results">No articles found</div>';
            loadMoreButton.style.display = 'none';
            return;
        }

        // Create cards asynchronously
        const cardPromises = articles.map(article => createArticleCard(article));
        const cards = await Promise.all(cardPromises);
        cards.forEach(card => articlesGrid.appendChild(card));

        hasMoreArticles = hasMore;
        loadMoreButton.style.display = hasMore ? 'block' : 'none';
        currentPage++;
    } catch (error) {
        console.error('Error loading articles:', error);
        articlesGrid.innerHTML = '<div class="no-results">Error loading articles</div>';
    } finally {
        hideLoading();
    }
};

// Event Listeners
searchInput.addEventListener('input', debounce(() => {
    currentSearch = searchInput.value.trim();
    loadArticles(true);
}, DEBOUNCE_DELAY));

filterButton.addEventListener('click', () => {
    // Implement filter modal or dropdown
    console.log('Filter clicked');
});

loadMoreButton.addEventListener('click', () => {
    loadArticles();
});

// Initialize categories from database
const initializeCategories = async () => {
    try {
        const postsRef = ref(db, 'posts');
        const snapshot = await get(postsRef);
        const categories = new Set();

        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const category = childSnapshot.val().data.category;
                if (category) categories.add(category);
            });
        }

        categories.forEach(category => {
            const categoryTag = document.createElement('div');
            categoryTag.className = 'category-tag';
            categoryTag.textContent = category;
            categoryTag.dataset.category = category;
            categoryTag.addEventListener('click', () => handleCategoryClick(category));
            categoriesContainer.appendChild(categoryTag);
        });
    } catch (error) {
        console.error('Error initializing categories:', error);
    }
};

// Category handling
const handleCategoryClick = (category) => {
    const categoryTags = document.querySelectorAll('.category-tag');
    categoryTags.forEach(tag => tag.classList.remove('active'));
    
    if (currentCategory === category) {
        currentCategory = '';
    } else {
        currentCategory = category;
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
    }
    
    loadArticles(true);
};

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    initializeCategories();
    loadArticles();
}); 