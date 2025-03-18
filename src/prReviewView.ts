import * as vscode from 'vscode';
import { GitHubService, PullRequest } from './githubAuth';
import * as fs from 'fs';
import * as path from 'path';

export class PRReviewView {
  private static instance: PRReviewView | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];
  private _onDidReceiveMessage = new vscode.EventEmitter<any>();
  readonly onDidReceiveMessage = this._onDidReceiveMessage.event;
  private isLoading: boolean = false;
  private currentPage: number = 1;
  private itemsPerPage: number = 10;
  private totalCount: number = 0;
  private currentFilter: string = 'open';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly githubService: GitHubService
  ) {}

  // Use singleton pattern to ensure only one instance of the panel
  public static getInstance(extensionUri: vscode.Uri, githubService: GitHubService): PRReviewView {
    if (!PRReviewView.instance) {
      PRReviewView.instance = new PRReviewView(extensionUri, githubService);
    }
    return PRReviewView.instance;
  }

  public async show() {
    // If panel exists but was disposed, recreate it
    if (this.panel) {
      try {
        // Try to access the panel's state to check if it's disposed
        this.panel.webview.html;
      } catch {
        // If we can't access the panel's state, it's been disposed
        this.panel = undefined;
      }
    }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.isLoading = true;

    this.panel = vscode.window.createWebviewPanel(
      'prReview',
      'Pull Request Review',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri]
      }
    );

    this.panel.webview.html = await this.getWebviewContent();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.dispose();
    }, null, this.disposables);

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'login') {
          await this.githubService.login();
          await this.refreshPRs(1, this.itemsPerPage, this.currentFilter);
        } else if (message.command === 'autoLogin') {
          // Auto login if already authenticated
          if (this.githubService.isAuthenticated()) {
            const page = message.page || 1;
            const perPage = message.perPage || this.itemsPerPage;
            const state = message.state || 'open';
            this.currentFilter = state;
            await this.refreshPRs(page, perPage, state);
          } else {
            // Not authenticated, show login prompt
            this.panel?.webview.postMessage({
              command: 'updateContent',
              data: {
                error: 'Please log in to GitHub to view pull requests.',
                user: null,
                prs: [],
                repo: null
              }
            });
          }
        } else if (message.command === 'logout') {
          await this.githubService.logout();
          this.panel?.webview.postMessage({
            command: 'updateContent',
            data: {
              error: 'You have been logged out. Please log in to GitHub.',
              user: null,
              prs: [],
              repo: null
            }
          });
        } else if (message.command === 'refreshPRs') {
          const page = message.page || 1;
          const perPage = message.perPage || this.itemsPerPage;
          const state = message.state || 'open';
          this.currentFilter = state;
          await this.refreshPRs(page, perPage, state);
        } else if (message.command === 'openPR') {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        
        this._onDidReceiveMessage.fire(message);
      },
      null,
      this.disposables
    );
  }

  private async refreshPRs(page: number = 1, perPage: number = 10, state: string = 'open') {
    if (!this.panel) {
      return;
    }

    this.isLoading = true;
    this.currentPage = page;
    this.itemsPerPage = perPage;
    
    // Send loading message with specific text
    this.panel.webview.postMessage({
      command: 'updateContent',
      data: { 
        loading: true,
        loadingMessage: 'Retrieving pull requests...'
      }
    });

    try {
      const user = this.githubService.getCurrentUser();
      
      if (!user) {
        this.panel.webview.postMessage({
          command: 'updateContent',
          data: {
            error: 'Not authenticated. Please log in to GitHub.',
            user: null,
            prs: [],
            repo: null
          }
        });
        return;
      }
      
      const repo = this.githubService.getCurrentRepo();
      
      if (!repo) {
        this.panel.webview.postMessage({
          command: 'updateContent',
          data: {
            error: 'No GitHub repository found in current workspace.',
            user: {
              name: user.name,
              login: user.login,
              avatarUrl: user.avatarUrl
            },
            prs: [],
            repo: null
          }
        });
        return;
      }
      
      // Update loading message with more specific text
      this.panel.webview.postMessage({
        command: 'updateContent',
        data: { 
          loading: true,
          loadingMessage: 'Fetching pull requests for ' + repo.owner + '/' + repo.repo + '...'
        }
      });
      
      // Get paginated PR information
      const { pullRequests, totalCount, hasNextPage } = await this.githubService.getPaginatedPullRequests(
        repo.owner, 
        repo.repo, 
        state, 
        page, 
        perPage
      );
      
      // Store total count for pagination
      this.totalCount = totalCount;
      
      // Update loading message for details fetching phase
      if (pullRequests.length > 0) {
        this.panel.webview.postMessage({
          command: 'updateContent',
          data: { 
            loading: true,
            loadingMessage: 'Fetching PR details...'
          }
        });
      }
      
      // Process each PR to get additional details
      const prsWithDetails = await Promise.all(
        pullRequests.map(async (pr: PullRequest) => {
          try {
            // Get PR reviews
            const reviews = await this.githubService.getPullRequestReviews(repo.owner, repo.repo, pr.number);
            const userReview = reviews.find(review => review.user.login === user.login);
            
            // Get PR details including file changes if not already present
            let prDetails = { ...pr };
            
            // If PR doesn't have details like changed_files, we need to fetch them
            if (typeof pr.changed_files === 'undefined') {
              try {
                const details = await this.githubService.getPullRequestDetails(
                  repo.owner, 
                  repo.repo, 
                  pr.number
                );
                
                prDetails = {
                  ...prDetails,
                  changed_files: details.changed_files || 0,
                  additions: details.additions || 0,
                  deletions: details.deletions || 0,
                  comments: details.comments || 0
                };
              } catch (error) {
                console.error(`Failed to get details for PR #${pr.number}:`, error);
              }
            }
            
            return {
              ...prDetails,
              reviewStatus: userReview ? userReview.state : null,
              reviewers: pr.requested_reviewers || []
            };
          } catch (error) {
            console.error(`Error processing PR #${pr.number}:`, error);
            return pr;
          }
        })
      );

      // Final message with completed data
      this.panel.webview.postMessage({
        command: 'updateContent',
        data: {
          user: {
            name: user.name,
            login: user.login,
            avatarUrl: user.avatarUrl
          },
          prs: prsWithDetails,
          repo: {
            name: repo.repo,
            owner: repo.owner,
            full_name: `${repo.owner}/${repo.repo}`,
            url: `https://github.com/${repo.owner}/${repo.repo}`
          },
          hasMorePages: hasNextPage,
          totalCount: totalCount,
          message: `Found ${prsWithDetails.length} pull requests`
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to fetch pull requests: ${error instanceof Error ? error.message : String(error)}`);
      if (this.panel) {
        this.panel.webview.postMessage({
          command: 'updateContent',
          data: {
            error: `Failed to fetch pull requests: ${error instanceof Error ? error.message : String(error)}`,
            user: null,
            prs: [],
            repo: null
          }
        });
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async getWebviewContent() {
    try {
      const htmlPath = path.join(this.extensionUri.fsPath, 'src', 'views', 'prReview.html');
      const cssPath = path.join(this.extensionUri.fsPath, 'src', 'styles', 'prReview.css');
      const jsPath = path.join(this.extensionUri.fsPath, 'src', 'scripts', 'prReview.js');

      let htmlContent = await fs.promises.readFile(htmlPath, 'utf8');
      let cssContent = await fs.promises.readFile(cssPath, 'utf8');
      let jsContent = await fs.promises.readFile(jsPath, 'utf8');

      // Replace the CSS and JS file references with their content
      htmlContent = htmlContent.replace(
        '<link rel="stylesheet" href="../styles/prReview.css">',
        `<style>${cssContent}</style>`
      );
      htmlContent = htmlContent.replace(
        '<script src="../scripts/prReview.js"></script>',
        `<script>${jsContent}</script>`
      );

      return htmlContent;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load webview content: ${error instanceof Error ? error.message : String(error)}`);
      return `
        <html>
          <body>
            <h1>Error loading PR Review</h1>
            <p>Failed to load the PR Review page. Please try again or check the logs.</p>
            <button onclick="vscode.postMessage({command: 'refreshPRs'})">Retry</button>
          </body>
        </html>
      `;
    }
  }

  public dispose() {
    if (this.panel) {
      this.panel.dispose();
    }
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
} 