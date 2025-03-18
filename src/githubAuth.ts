import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
// Using require instead of import to avoid TypeScript errors
// @ts-ignore
const { Octokit } = require('@octokit/rest');

// Use a type assertion to avoid the need for type definitions
type Octokit = any;

export interface GitHubUser {
  name: string;
  login: string;
  avatarUrl: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatarUrl: string;
  };
  requested_reviewers: Array<{
    login: string;
    avatarUrl: string;
  }>;
  changed_files: number;
  additions: number;
  deletions: number;
  comments: number;
}

export interface PullRequestReview {
  state: string;
  user: {
    login: string;
    avatarUrl: string;
  };
}

export interface PRComment {
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

interface GitHubComment {
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

export class GitHubService {
  private context: vscode.ExtensionContext;
  private octokit: Octokit | null = null;
  private _onDidChangeAuthentication = new vscode.EventEmitter<boolean>();
  readonly onDidChangeAuthentication = this._onDidChangeAuthentication.event;
  private currentUser: GitHubUser | null = null;
  private currentRepo: { owner: string; repo: string } | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initializeFromStoredToken();
    this.initializeCurrentRepo();
  }

  private async initializeCurrentRepo() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
      }

      const rootFolder = workspaceFolders[0];
      const packageJsonPath = path.join(rootFolder.uri.fsPath, 'package.json');

      // First try to get repository from package.json
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const repoInfo = packageJson.repository;

        if (repoInfo) {
          if (typeof repoInfo === 'string') {
            // Handle case where repository is a string like "owner/repo.git"
            const match = repoInfo.match(/([^/]+)\/([^/]+?)(?:\.git)?$/);
            if (match) {
              this.currentRepo = {
                owner: match[1],
                repo: match[2]
              };
              return;
            }
          } else if (typeof repoInfo === 'object' && repoInfo.url) {
            // Handle case where repository is an object with url property
            const match = repoInfo.url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
            if (match) {
              this.currentRepo = {
                owner: match[1],
                repo: match[2]
              };
              return;
            }
          }
        }
      }

      // If package.json doesn't have repository info, try git remote
      const remoteUrl = await this.getGitRemoteUrl(rootFolder.uri.fsPath);
      if (remoteUrl) {
        const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
        if (match) {
          this.currentRepo = {
            owner: match[1],
            repo: match[2]
          };
        }
      }

      if (!this.currentRepo) {
        console.log('No GitHub repository found in package.json or git remote');
      }
    } catch (error) {
      console.error('Failed to initialize current repo:', error);
    }
  }

  private async getGitRemoteUrl(workspacePath: string): Promise<string | null> {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExtension) {
        return null;
      }

      const api = gitExtension.getAPI(1);
      const repo = api.repositories.find((r: any) => r.rootUri.fsPath === workspacePath);
      if (!repo) {
        return null;
      }

      const remotes = await repo.getRemotes(true);
      const origin = remotes.find((r: any) => r.name === 'origin');
      return origin?.fetchUrl || null;
    } catch (error) {
      console.error('Failed to get git remote URL:', error);
      return null;
    }
  }

  private async initializeFromStoredToken() {
    const token = this.context.globalState.get<string>('github.token');
    if (token) {
      try {
        this.octokit = new Octokit({ auth: token });
        await this.fetchUserInfo();
        this._onDidChangeAuthentication.fire(true);
      } catch (error) {
        console.error('Failed to initialize from stored token:', error);
        this.octokit = null;
        this.currentUser = null;
        this.context.globalState.update('github.token', undefined);
      }
    }
  }

  public async login(): Promise<boolean> {
    try {
      // First check if we already have a valid session
      const existingSession = await vscode.authentication.getSession('github', ['repo', 'read:user', 'read:org'], { createIfNone: false });
      if (existingSession) {
        this.octokit = new Octokit({ auth: existingSession.accessToken });
        await this.fetchUserInfo();
        await this.context.globalState.update('github.token', existingSession.accessToken);
        this._onDidChangeAuthentication.fire(true);
        return true;
      }

      // If no existing session, create a new one with required scopes
      const session = await vscode.authentication.getSession('github', ['repo', 'read:user', 'read:org'], { createIfNone: true });
      
      if (session) {
        this.octokit = new Octokit({ auth: session.accessToken });
        
        // Check if we have access to the current repository
        if (this.currentRepo) {
          try {
            await this.octokit.repos.get({
              owner: this.currentRepo.owner,
              repo: this.currentRepo.repo
            });
          } catch (error: any) {
            if (error.status === 404) {
              vscode.window.showErrorMessage('Repository not found. Please check the repository URL.');
              return false;
            } else if (error.status === 403) {
              // Check for SAML organization access error
              if (error.message && error.message.includes('Resource protected by organization SAML enforcement')) {
                // Clear the current session to force re-authentication
                await this.logout();
                
                // Show specific message for SAML organization access
                const action = await vscode.window.showErrorMessage(
                  'This repository is protected by organization SAML. You need to re-authenticate with organization access.',
                  'Re-authenticate'
                );
                
                if (action === 'Re-authenticate') {
                  // Force a new session with organization access
                  const newSession = await vscode.authentication.getSession('github', ['repo', 'read:user', 'read:org'], { createIfNone: true });
                  if (newSession) {
                    this.octokit = new Octokit({ auth: newSession.accessToken });
                    await this.fetchUserInfo();
                    await this.context.globalState.update('github.token', newSession.accessToken);
                    this._onDidChangeAuthentication.fire(true);
                    return true;
                  }
                }
                return false;
              }
              vscode.window.showErrorMessage('Access denied. Please ensure you have access to this repository.');
              return false;
            }
            throw error; // Re-throw other errors
          }
        }

        await this.fetchUserInfo();
        await this.context.globalState.update('github.token', session.accessToken);
        this._onDidChangeAuthentication.fire(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('GitHub authentication error:', error);
      vscode.window.showErrorMessage(`GitHub authentication failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  public async logout(): Promise<void> {
    try {
      // Clear the stored token
      await this.context.globalState.update('github.token', undefined);
      
      // Reset the Octokit instance and user info
      this.octokit = null;
      this.currentUser = null;
      
      // Notify listeners that authentication state has changed
      this._onDidChangeAuthentication.fire(false);
      
      // Show success message
      vscode.window.showInformationMessage('Successfully logged out from GitHub');
    } catch (error) {
      console.error('Logout error:', error);
      vscode.window.showErrorMessage(`Failed to logout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public isAuthenticated(): boolean {
    return this.octokit !== null && this.currentUser !== null;
  }

  public getCurrentUser(): GitHubUser | null {
    return this.currentUser;
  }

  public getCurrentRepo(): { owner: string; repo: string } | null {
    return this.currentRepo;
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    try {
      const { data } = await this.octokit.users.getAuthenticated();
      this.currentUser = {
        name: data.name || data.login,
        login: data.login,
        avatarUrl: data.avatar_url
      };
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      throw error;
    }
  }

  public async getPullRequests(): Promise<PullRequest[]> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    if (!this.currentRepo) {
      throw new Error('No GitHub repository found in current workspace');
    }

    try {
      const { data: pullRequests } = await this.octokit.pulls.list({
        owner: this.currentRepo.owner,
        repo: this.currentRepo.repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100
      });

      return pullRequests.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state,
        html_url: pr.html_url,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        user: {
          login: pr.user.login,
          avatarUrl: pr.user.avatar_url
        },
        requested_reviewers: pr.requested_reviewers.map((reviewer: any) => ({
          login: reviewer.login,
          avatarUrl: reviewer.avatar_url
        })),
        changed_files: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        comments: pr.comments
      }));
    } catch (error: any) {
      console.error('Error fetching pull requests:', error);
      
      // Check for SAML organization access error
      if (error.message && error.message.includes('Resource protected by organization SAML enforcement')) {
        // Clear the current session
        await this.logout();
        
        // Show specific message for SAML organization access
        const action = await vscode.window.showErrorMessage(
          'This repository is protected by organization SAML. You need to re-authenticate with organization access.',
          'Re-authenticate'
        );
        
        if (action === 'Re-authenticate') {
          // Force a new session with organization access
          const newSession = await vscode.authentication.getSession('github', ['repo', 'read:user', 'read:org'], { createIfNone: true });
          if (newSession) {
            this.octokit = new Octokit({ auth: newSession.accessToken });
            await this.fetchUserInfo();
            await this.context.globalState.update('github.token', newSession.accessToken);
            this._onDidChangeAuthentication.fire(true);
            
            // Retry the pull request fetch
            return this.getPullRequests();
          }
        }
      }
      
      throw error;
    }
  }

  public async getPRComments(owner: string, repo: string, pullNumber: number): Promise<PRComment[]> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    try {
      const { data: issueComments } = await this.octokit.issues.listComments({
        owner,
        repo,
        issue_number: pullNumber
      });

      const { data: reviewComments } = await this.octokit.pulls.listReviewComments({
        owner,
        repo,
        pull_number: pullNumber
      });

      const formattedIssueComments = issueComments.map((comment: any) => ({
        id: comment.id,
        body: comment.body,
        user: {
          login: comment.user.login,
          avatar_url: comment.user.avatar_url
        },
        created_at: comment.created_at
      }));

      const formattedReviewComments = reviewComments.map((comment: any) => ({
        id: comment.id,
        body: comment.body,
        user: {
          login: comment.user.login,
          avatar_url: comment.user.avatar_url
        },
        created_at: comment.created_at,
        path: comment.path,
        position: comment.position,
        line: comment.line
      }));

      return [...formattedIssueComments, ...formattedReviewComments];
    } catch (error) {
      console.error('Error fetching PR comments:', error);
      throw error;
    }
  }

  public async addCommentToPR(owner: string, repo: string, pullNumber: number, body: string): Promise<PRComment> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    try {
      const { data } = await this.octokit.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body
      });

      return {
        id: data.id,
        body: data.body,
        user: {
          login: data.user.login,
          avatar_url: data.user.avatar_url
        },
        created_at: data.created_at
      };
    } catch (error) {
      console.error('Error adding comment to PR:', error);
      throw error;
    }
  }

  public async addReviewComment(
    owner: string, 
    repo: string, 
    pullNumber: number, 
    body: string,
    commitId: string,
    path: string,
    position: number
  ): Promise<PRComment> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }

    try {
      const { data } = await this.octokit.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        body,
        commit_id: commitId,
        path,
        position
      });

      return {
        id: data.id,
        body: data.body,
        user: {
          login: data.user.login,
          avatar_url: data.user.avatar_url
        },
        created_at: data.created_at,
        path: data.path,
        position: data.position
      };
    } catch (error) {
      console.error('Error adding review comment to PR:', error);
      throw error;
    }
  }

  async getPullRequestReviews(owner: string, repo: string, prNumber: number): Promise<PullRequestReview[]> {
    try {
      const response = await this.octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
      });

      return response.data.map((review: { state: string; user: { login: string; avatar_url: string } }) => ({
        state: review.state,
        user: {
          login: review.user.login,
          avatarUrl: review.user.avatar_url
        }
      }));
    } catch (error) {
      console.error('Failed to fetch PR reviews:', error);
      return [];
    }
  }
  
  async getPullRequestDetails(owner: string, repo: string, prNumber: number): Promise<Partial<PullRequest>> {
    if (!this.octokit) {
      throw new Error('Not authenticated');
    }
    
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      });
      
      return {
        changed_files: data.changed_files,
        additions: data.additions,
        deletions: data.deletions,
        comments: data.comments
      };
    } catch (error) {
      console.error(`Failed to get details for PR #${prNumber}:`, error);
      return {};
    }
  }

  public async getPaginatedPullRequests(
    owner: string,
    repo: string,
    state: string = 'open',
    page: number = 1,
    perPage: number = 10
  ): Promise<{ pullRequests: PullRequest[]; totalCount: number; hasNextPage: boolean }> {
    try {
      if (!this.octokit) {
        await this.login();
      }

      if (!this.octokit) {
        throw new Error('Not authenticated with GitHub');
      }

      const result = await this.octokit.pulls.list({
        owner,
        repo,
        state,
        page,
        per_page: perPage,
      });

      // Extract the total count from the response headers if available
      let totalCount = 0;
      if (result.headers && result.headers['link']) {
        const linkHeader = result.headers['link'] as string;
        const matches = linkHeader.match(/page=\d+&per_page=\d+>; rel="last"/);
        if (matches && matches.length > 0) {
          const lastPageMatch = linkHeader.match(/page=(\d+)/);
          if (lastPageMatch && lastPageMatch[1]) {
            totalCount = parseInt(lastPageMatch[1]) * perPage;
          }
        }
      }

      // If totalCount is still 0, use the current page items length as fallback
      if (totalCount === 0) {
        totalCount = result.data.length;
      }

      // Check if there's a next page
      const hasNextPage = result.data.length === perPage && result.data.length > 0;

      // Map the response to our PullRequest type
      const pullRequests = result.data.map((pr: any) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        html_url: pr.html_url,
        user: {
          login: pr.user?.login || 'unknown',
          avatar_url: pr.user?.avatar_url || '',
        },
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        closed_at: pr.closed_at,
        merged_at: pr.merged_at,
        body: pr.body || '',
        requested_reviewers: pr.requested_reviewers || [],
        draft: pr.draft || false,
      }));

      return { pullRequests, totalCount, hasNextPage };
    } catch (error) {
      console.error('Failed to get pull requests:', error);
      throw error;
    }
  }
} 