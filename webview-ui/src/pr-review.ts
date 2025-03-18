import './pr-review.css';

// Interfaces
interface GitHubUser {
  name: string;
  login: string;
  avatarUrl: string;
}

interface PullRequest {
  id: number;
  title: string;
  number: number;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  updated_at: string;
  repository: {
    name: string;
    full_name: string;
  };
  state: string;
  body: string;
}

interface PRComment {
  id: number;
  body: string;
  user: {
    login: string;
    avatar_url: string;
  };
  created_at: string;
  path?: string;
  position?: number;
  line?: number;
}

// State
let currentUser: GitHubUser | null = null;
let pullRequests: PullRequest[] = [];
let currentPR: PullRequest | null = null;
let comments: PRComment[] = [];

// VS Code API
const vscode = acquireVsCodeApi();

// Elements
const loadingEl = document.getElementById('loading') as HTMLElement;
const loginContainerEl = document.getElementById('login-container') as HTMLElement;
const contentEl = document.getElementById('content') as HTMLElement;
const userInfoEl = document.getElementById('user-info') as HTMLElement;
const prListEl = document.getElementById('pr-list') as HTMLElement;
const prDetailsEl = document.getElementById('pr-details') as HTMLElement;
const prTitleEl = document.getElementById('pr-title') as HTMLElement;
const prMetaEl = document.getElementById('pr-meta') as HTMLElement;
const prDescriptionEl = document.getElementById('pr-description') as HTMLElement;
const commentsListEl = document.getElementById('comments-list') as HTMLElement;
const commentInputEl = document.getElementById('comment-input') as HTMLTextAreaElement;
const loginButtonEl = document.getElementById('login-button') as HTMLButtonElement;
const logoutButtonEl = document.getElementById('logout-button') as HTMLButtonElement;
const refreshButtonEl = document.getElementById('refresh-button') as HTMLButtonElement;
const backButtonEl = document.getElementById('back-button') as HTMLButtonElement;
const submitCommentEl = document.getElementById('submit-comment') as HTMLButtonElement;

// Initialize
window.addEventListener('load', () => {
  // Tell the extension we're ready
  vscode.postMessage({ command: 'webviewReady' });
  
  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Login button
  loginButtonEl.addEventListener('click', () => {
    showLoading();
    vscode.postMessage({ command: 'login' });
  });
  
  // Logout button
  logoutButtonEl.addEventListener('click', () => {
    vscode.postMessage({ command: 'logout' });
  });
  
  // Refresh button
  refreshButtonEl.addEventListener('click', () => {
    showLoading();
    vscode.postMessage({ command: 'getPRs' });
  });
  
  // Back button
  backButtonEl.addEventListener('click', () => {
    showPRList();
  });
  
  // Submit comment button
  submitCommentEl.addEventListener('click', () => {
    if (!currentPR || !commentInputEl.value.trim()) {
      return;
    }
    
    const [owner, repo] = currentPR.repository.full_name.split('/');
    
    vscode.postMessage({
      command: 'addComment',
      ownerName: owner,
      repoName: repo,
      prNumber: currentPR.number,
      commentText: commentInputEl.value
    });
    
    // Clear the input
    commentInputEl.value = '';
    commentInputEl.disabled = true;
    submitCommentEl.disabled = true;
  });
  
  // Handle messages from the extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.command) {
      case 'requireLogin':
        showLoginScreen();
        break;
      case 'userAuthenticated':
        currentUser = message.user;
        updateUserInfo();
        showContent();
        break;
      case 'userLoggedOut':
        currentUser = null;
        showLoginScreen();
        break;
      case 'prsLoaded':
        pullRequests = message.pullRequests;
        renderPullRequests();
        hideLoading();
        break;
      case 'prCommentsLoaded':
        comments = message.comments;
        renderComments();
        break;
      case 'commentAdded':
        comments.push(message.comment);
        renderComments();
        commentInputEl.disabled = false;
        submitCommentEl.disabled = false;
        break;
      case 'error':
        hideLoading();
        showError(message.message);
        break;
    }
  });
}

// UI Functions
function showLoading() {
  loadingEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
  loginContainerEl.classList.add('hidden');
}

function hideLoading() {
  loadingEl.classList.add('hidden');
}

function showLoginScreen() {
  hideLoading();
  loginContainerEl.classList.remove('hidden');
  contentEl.classList.add('hidden');
}

function showContent() {
  hideLoading();
  contentEl.classList.remove('hidden');
  loginContainerEl.classList.add('hidden');
}

function showPRList() {
  prDetailsEl.classList.add('hidden');
  prListEl.parentElement!.classList.remove('hidden');
  currentPR = null;
}

function showPRDetails() {
  prDetailsEl.classList.remove('hidden');
  prListEl.parentElement!.classList.add('hidden');
}

function updateUserInfo() {
  if (!currentUser) {
    return;
  }
  
  userInfoEl.innerHTML = `
    <div class="user-avatar">
      <img src="${currentUser.avatarUrl}" alt="${currentUser.name}" />
    </div>
    <div class="user-name">
      <span>${currentUser.name}</span>
      <span class="user-login">@${currentUser.login}</span>
    </div>
  `;
}

function renderPullRequests() {
  if (!pullRequests.length) {
    prListEl.innerHTML = '<div class="no-prs">No pull requests found</div>';
    return;
  }
  
  prListEl.innerHTML = '';
  
  pullRequests.forEach(pr => {
    const prElement = document.createElement('div');
    prElement.className = 'pr-item';
    prElement.innerHTML = `
      <div class="pr-header">
        <span class="pr-number">#${pr.number}</span>
        <span class="pr-title">${pr.title}</span>
      </div>
      <div class="pr-meta">
        <span class="pr-repo">${pr.repository.full_name}</span>
        <span class="pr-updated">Updated ${formatDate(pr.updated_at)}</span>
      </div>
    `;
    
    prElement.addEventListener('click', () => {
      currentPR = pr;
      renderPRDetails();
      showPRDetails();
      
      // Load comments
      const [owner, repo] = pr.repository.full_name.split('/');
      vscode.postMessage({
        command: 'getPRComments',
        owner,
        repo,
        pullNumber: pr.number
      });
    });
    
    prListEl.appendChild(prElement);
  });
}

function renderPRDetails() {
  if (!currentPR) {
    return;
  }
  
  prTitleEl.textContent = currentPR.title;
  
  prMetaEl.innerHTML = `
    <div class="pr-meta-item">
      <span class="pr-repo">${currentPR.repository.full_name}</span>
    </div>
    <div class="pr-meta-item">
      <span class="pr-author">Author: ${currentPR.user.login}</span>
    </div>
    <div class="pr-meta-item">
      <span class="pr-updated">Updated: ${formatDate(currentPR.updated_at)}</span>
    </div>
    <div class="pr-meta-item">
      <a href="${currentPR.html_url}" target="_blank" class="pr-link">View on GitHub</a>
    </div>
  `;
  
  // Render the PR description with markdown
  prDescriptionEl.innerHTML = `
    <div class="pr-description-content">
      ${currentPR.body || 'No description provided.'}
    </div>
  `;
  
  // Reset comments
  commentsListEl.innerHTML = '<div class="loading-comments">Loading comments...</div>';
  commentInputEl.value = '';
  commentInputEl.disabled = false;
  submitCommentEl.disabled = false;
}

function renderComments() {
  if (!comments.length) {
    commentsListEl.innerHTML = '<div class="no-comments">No comments yet</div>';
    return;
  }
  
  commentsListEl.innerHTML = '';
  
  comments.forEach(comment => {
    const commentElement = document.createElement('div');
    commentElement.className = 'comment-item';
    commentElement.innerHTML = `
      <div class="comment-header">
        <img src="${comment.user.avatar_url}" alt="${comment.user.login}" class="comment-avatar" />
        <span class="comment-author">${comment.user.login}</span>
        <span class="comment-date">${formatDate(comment.created_at)}</span>
      </div>
      <div class="comment-body">
        ${comment.body}
      </div>
      ${comment.path ? `
        <div class="comment-file">
          <span class="comment-file-path">${comment.path}</span>
          ${comment.line ? `<span class="comment-line">Line ${comment.line}</span>` : ''}
        </div>
      ` : ''}
    `;
    
    commentsListEl.appendChild(commentElement);
  });
}

function showError(message: string) {
  // Implementation can be expanded with a proper error UI
  console.error(message);
  vscode.postMessage({ command: 'showError', message });
}

// Helper Functions
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// For TypeScript
declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}; 