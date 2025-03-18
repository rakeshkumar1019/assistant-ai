// Establish connection with VSCode extension
const vscode = acquireVsCodeApi();

// Store state
let state = {
    user: null,
    prs: [],
    repo: null,
    filteredPRs: [],
    searchTerm: '',
    filter: 'open',
    currentPage: 1,
    itemsPerPage: 10,
    totalCount: 0,
    hasMorePages: false
};

// Elements
const elements = {
    loadingContainer: document.getElementById('loading-container'),
    loadingMessage: document.getElementById('loading-message'),
    loginContainer: document.getElementById('login-container'),
    loginButton: document.getElementById('login-button'),
    content: document.getElementById('content'),
    userAvatar: document.getElementById('user-avatar'),
    userName: document.getElementById('user-name'),
    userLogin: document.getElementById('user-login'),
    repoName: document.getElementById('repo-name'),
    repoLink: document.getElementById('repo-link'),
    prStats: document.getElementById('pr-stats'),
    errorMessage: document.getElementById('error-message'),
    infoMessage: document.getElementById('info-message'),
    searchInput: document.getElementById('search-input'),
    filterOpen: document.getElementById('filter-open'),
    filterClosed: document.getElementById('filter-closed'),
    prList: document.getElementById('pr-list'),
    pagination: document.getElementById('pagination'),
    prevPage: document.getElementById('prev-page'),
    nextPage: document.getElementById('next-page'),
    currentPageSpan: document.getElementById('current-page'),
    totalPagesSpan: document.getElementById('total-pages'),
    emptyState: document.getElementById('empty-state'),
    refreshButton: document.getElementById('refresh-button'),
    logoutButton: document.getElementById('logout-button'),
    prListContainer: document.getElementById('pr-list-container')
};

// Utility functions
function showLoading(message = 'Loading...') {
    // Hide other containers first
    elements.content.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    
    // Clear error/info messages
    elements.errorMessage.style.display = 'none';
    elements.infoMessage.style.display = 'none';
    
    // Set and show loading message
    elements.loadingMessage.textContent = message;
    elements.loadingContainer.style.display = 'flex';
}

function hideLoading() {
    elements.loadingContainer.style.display = 'none';
}

function showLogin() {
    // Hide other containers
    elements.loadingContainer.style.display = 'none';
    elements.content.style.display = 'none';
    
    // Show login
    elements.loginContainer.style.display = 'flex';
}

function showContent() {
    // Hide other containers
    elements.loadingContainer.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    
    // Show content
    elements.content.style.display = 'block';
}

function showError(message) {
    if (!message) {
        elements.errorMessage.style.display = 'none';
        return;
    }
    
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

function showInfo(message, autoClear = true) {
    if (!message) {
        elements.infoMessage.style.display = 'none';
        return;
    }
    
    elements.infoMessage.textContent = message;
    elements.infoMessage.style.display = 'block';
    
    if (autoClear) {
        setTimeout(() => {
            elements.infoMessage.style.display = 'none';
        }, 3000);
    }
}

function hideInfo() {
    elements.infoMessage.style.display = 'none';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 30) {
        return `${diffDays} days ago`;
    } else {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString(undefined, options);
    }
}

function safeGetValue(obj, path, defaultValue = 'N/A') {
    return path.split('.').reduce((prev, curr) => 
        prev && prev[curr] !== undefined ? prev[curr] : defaultValue
    , obj);
}

// PR State functions
function getPRStateClass(pr) {
    if (pr.merged_at) return 'merged';
    if (pr.state === 'closed') return 'closed';
    if (pr.draft) return 'draft';
    return 'open';
}

function getPRStateIcon(pr) {
    let icon = '';
    
    if (pr.merged_at) {
        icon = '<svg class="pr-icon merged" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>';
    } else if (pr.state === 'closed') {
        icon = '<svg class="pr-icon closed" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    } else if (pr.draft) {
        icon = '<svg class="pr-icon draft" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    } else {
        icon = '<svg class="pr-icon open" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>';
    }
    
    return icon;
}

// Filter and search functions
function filterAndSearchPRs() {
    const searchTerm = state.searchTerm.toLowerCase();
    
    state.filteredPRs = state.prs.filter(pr => {
        const matchesFilter = state.filter === 'open' 
            ? pr.state === 'open' 
            : pr.state === 'closed';
            
        const matchesSearch = !searchTerm || 
            pr.title.toLowerCase().includes(searchTerm) || 
            (pr.user && pr.user.login && pr.user.login.toLowerCase().includes(searchTerm)) ||
            (pr.body && pr.body.toLowerCase().includes(searchTerm));
            
        return matchesFilter && matchesSearch;
    });
    
    updatePRList();
    updatePagination();
}

// Render functions
function renderUser() {
    if (!state.user) return;
    
    elements.userAvatar.src = state.user.avatarUrl || '';
    elements.userName.textContent = state.user.name || state.user.login;
    elements.userLogin.textContent = `@${state.user.login}`;
}

function renderRepo() {
    if (!state.repo) return;
    
    elements.repoName.textContent = state.repo.full_name;
    elements.repoLink.href = state.repo.url;
    
    // Add PR stats
    if (state.totalCount > 0) {
        elements.prStats.textContent = `${state.totalCount} Pull Requests`;
    } else {
        elements.prStats.textContent = 'No Pull Requests';
    }
}

function renderPRItem(pr) {
    const stateClass = getPRStateClass(pr);
    const stateIcon = getPRStateIcon(pr);
    
    // Get user avatar or generate placeholder
    let userAvatar = '';
    if (safeGetValue(pr, 'user.avatar_url', '')) {
        userAvatar = `<img class="pr-user-avatar" src="${pr.user.avatar_url}" alt="${pr.user.login}" />`;
    } else {
        const initials = pr.user.login.substring(0, 2).toUpperCase();
        userAvatar = `<div class="pr-user-avatar-placeholder">${initials}</div>`;
    }
    
    // Format dates
    const createdDate = formatDate(pr.created_at);
    const updatedDate = formatDate(pr.updated_at);
    
    // Handle file changes, additions and deletions
    const fileChanges = safeGetValue(pr, 'changed_files', 0);
    const additions = safeGetValue(pr, 'additions', 0);
    const deletions = safeGetValue(pr, 'deletions', 0);
    
    const prElement = document.createElement('div');
    prElement.className = `pr-item ${stateClass}`;
    prElement.innerHTML = `
        <div class="pr-header">
            <div class="pr-state">
                ${stateIcon}
            </div>
            <div class="pr-title-container">
                <h3 class="pr-title">
                    <a href="${pr.html_url}" target="_blank" class="pr-link">
                        ${pr.title}
                    </a>
                </h3>
                <div class="pr-meta">
                    <span class="pr-number">#${pr.number}</span>
                    <span class="pr-date">Created: ${createdDate}</span>
                    <span class="pr-date">Updated: ${updatedDate}</span>
                </div>
            </div>
            ${userAvatar}
        </div>
        <div class="pr-details">
            <div class="pr-stats">
                <span class="pr-files" title="Files changed">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    ${fileChanges} files
                </span>
                <span class="pr-additions" title="Lines added">
                    <span class="addition-marker">+</span>${additions}
                </span>
                <span class="pr-deletions" title="Lines deleted">
                    <span class="deletion-marker">-</span>${deletions}
                </span>
                ${pr.comments ? `
                <span class="pr-comments" title="Comments">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    ${pr.comments}
                </span>` : ''}
            </div>
            ${pr.reviewStatus ? `
            <div class="review-status ${pr.reviewStatus.toLowerCase()}">${pr.reviewStatus}</div>
            ` : ''}
        </div>
    `;
    
    prElement.addEventListener('click', (e) => {
        // Only open when clicking outside a direct link (which has its own behavior)
        if (!e.target.closest('a')) {
            vscode.postMessage({
                command: 'openPR',
                url: pr.html_url
            });
        }
    });
    
    return prElement;
}

function updatePRList() {
    elements.prList.innerHTML = '';
    
    if (state.filteredPRs.length === 0) {
        elements.emptyState.style.display = 'flex';
        elements.prList.style.display = 'none';
        return;
    }
    
    elements.emptyState.style.display = 'none';
    elements.prList.style.display = 'block';
    
    state.filteredPRs.forEach(pr => {
        elements.prList.appendChild(renderPRItem(pr));
    });
}

function updatePagination() {
    const totalPages = Math.ceil(state.totalCount / state.itemsPerPage);
    
    elements.currentPageSpan.textContent = state.currentPage;
    elements.totalPagesSpan.textContent = totalPages || 1;
    
    elements.prevPage.disabled = state.currentPage <= 1;
    elements.nextPage.disabled = !state.hasMorePages;
    
    elements.pagination.style.display = totalPages > 1 ? 'flex' : 'none';
}

// Event handlers
function login() {
    showLoading('Logging in...');
    vscode.postMessage({ command: 'login' });
}

function logout() {
    showLoading('Logging out...');
    vscode.postMessage({ command: 'logout' });
}

function autoLogin() {
    showLoading('Checking authentication...');
    vscode.postMessage({ 
        command: 'autoLogin',
        page: state.currentPage,
        perPage: state.itemsPerPage,
        state: state.filter
    });
}

function refreshPRs(resetPage = true) {
    showLoading('Refreshing pull requests...');
    
    if (resetPage) {
        state.currentPage = 1;
    }
    
    vscode.postMessage({
        command: 'refreshPRs',
        page: state.currentPage,
        perPage: state.itemsPerPage,
        state: state.filter
    });
}

function setFilter(filter) {
    if (state.filter === filter) return;
    
    state.filter = filter;
    state.currentPage = 1; // Reset to first page when changing filters
    
    elements.filterOpen.classList.toggle('active', filter === 'open');
    elements.filterClosed.classList.toggle('active', filter === 'closed');
    
    refreshPRs(true);
}

function handleSearch() {
    state.searchTerm = elements.searchInput.value.trim();
    filterAndSearchPRs();
}

function goToPage(page) {
    if (page < 1) return;
    if (!state.hasMorePages && page > state.currentPage) return;
    
    state.currentPage = page;
    refreshPRs(false);
}

// Message handling
window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'updateContent':
            const data = message.data;
            
            // Handle loading state
            if (data.loading) {
                showLoading(data.loadingMessage || 'Loading...');
                return;
            }
            
            // Hide loading spinner
            hideLoading();
            
            // Handle error
            if (data.error) {
                showError(data.error);
                
                if (!data.user) {
                    // No user, show login screen
                    showLogin();
                } else {
                    // Has user but error with content, show content with error
                    showContent();
                }
                return;
            } else {
                // No error, make sure error message is hidden
                hideError();
            }
            
            // Update state
            if (data.user) state.user = data.user;
            if (data.repo) state.repo = data.repo;
            if (data.prs !== undefined) state.prs = data.prs;
            if (data.hasMorePages !== undefined) state.hasMorePages = data.hasMorePages;
            if (data.totalCount !== undefined) state.totalCount = data.totalCount;
            
            // Always show content at this point
            showContent();
            
            // Render user and repo info
            renderUser();
            renderRepo();
            
            // Show no PRs message or PR list
            if (!data.prs || data.prs.length === 0) {
                elements.emptyState.style.display = 'flex';
                elements.prList.style.display = 'none';
                elements.pagination.style.display = 'none';
            } else {
                elements.emptyState.style.display = 'none';
                filterAndSearchPRs();
            }
            
            // Show success message if provided
            if (data.message) {
                showInfo(data.message);
            }
            break;
    }
});

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Hide content and login initially, show only loading
    elements.content.style.display = 'none';
    elements.loginContainer.style.display = 'none';
    elements.loadingContainer.style.display = 'flex';
    
    // Attach event listeners
    elements.loginButton.addEventListener('click', login);
    elements.refreshButton.addEventListener('click', () => refreshPRs(true));
    elements.logoutButton.addEventListener('click', logout);
    elements.searchInput.addEventListener('input', handleSearch);
    elements.filterOpen.addEventListener('click', () => setFilter('open'));
    elements.filterClosed.addEventListener('click', () => setFilter('closed'));
    elements.prevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
    elements.nextPage.addEventListener('click', () => goToPage(state.currentPage + 1));
    
    // Initial auto-login attempt
    autoLogin();
});
