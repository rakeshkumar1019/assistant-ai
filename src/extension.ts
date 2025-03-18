import * as vscode from 'vscode';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { readdirSync } from 'fs';
import { GitHubService } from './githubAuth';
import { PRReviewView } from './prReviewView';

export async function activate(context: vscode.ExtensionContext) {
  // Helper function to ensure settings have the correct structure
  function getStructuredSettings() {
    const settings = context.globalState.get('aiAssistantSettings');
    const defaultSettings = {
      defaultProvider: 'openai',
      openai: { apiKey: '', modelName: 'gpt-3.5-turbo', provider: 'openai' },
      gemini: { apiKey: '', modelName: 'gemini-pro', provider: 'google' },
      ollama: { baseUrl: 'http://localhost:11434', modelName: 'llama2', provider: 'local' }
    };
    
    if (!settings) {
      return defaultSettings;
    }
    
    // Ensure all top-level properties exist
    const mergedSettings = { ...defaultSettings, ...settings };
    
    // Ensure all nested properties exist
    mergedSettings.openai = { ...defaultSettings.openai, ...mergedSettings.openai };
    mergedSettings.gemini = { ...defaultSettings.gemini, ...mergedSettings.gemini };
    mergedSettings.ollama = { ...defaultSettings.ollama, ...mergedSettings.ollama };
    
    return mergedSettings;
  }

  const provider = new ChatViewProvider(context.extensionUri, context, getStructuredSettings);
  
  // Initialize GitHub service
  const githubService = new GitHubService(context);
  const prReviewView = new PRReviewView(context.extensionUri, githubService);

  // Store the context in module exports for easy access
  module.exports.getContext = () => context;
  module.exports.getStructuredSettings = getStructuredSettings;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "chatUI.chatView",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        }
      }
    )
  );

  // Register commands
  let loginCommand = vscode.commands.registerCommand('assistant.loginToGithub', async () => {
    try {
      const success = await githubService.login();
      if (success) {
        prReviewView.show();
      } else {
        vscode.window.showErrorMessage('Failed to login to GitHub');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`GitHub login failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  let showPRReviewCommand = vscode.commands.registerCommand('assistant.showPrReview', async () => {
    if (githubService.isAuthenticated()) {
      prReviewView.show();
    } else {
      const action = await vscode.window.showInformationMessage(
        'You need to login to GitHub first',
        'Login'
      );
      if (action === 'Login') {
        vscode.commands.executeCommand('assistant.loginToGithub');
      }
    }
  });

  // Handle messages from the PR review webview
  prReviewView.onDidReceiveMessage(async (message: { command: string; url?: string }) => {
    switch (message.command) {
      case 'login':
        const success = await githubService.login();
        if (success) {
          prReviewView.show();
        }
        break;
      case 'logout':
        await githubService.logout();
        prReviewView.show();
        break;
      case 'refreshPRs':
        prReviewView.show();
        break;
      case 'openPR':
        if (message.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
    }
  });

  context.subscriptions.push(loginCommand);
  context.subscriptions.push(showPRReviewCommand);
  context.subscriptions.push({ dispose: () => prReviewView.dispose() });

  const showSettingsCommand = vscode.commands.registerCommand('assistant.showWebViewUi', () => {
    // Create and show settings panel in a new tab
    const panel = vscode.window.createWebviewPanel(
      'aiAssistantSettings',
      'AI Assistant Settings',
      vscode.ViewColumn.One, 
      {
        enableScripts: true,
        localResourceRoots: [context.extensionUri],
        retainContextWhenHidden: true
      }
    );
    
    panel.webview.html = getSettingsHtml(panel.webview, context.extensionUri);
    
    // Handle messages from the settings webview
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'webviewReady':
            // Load settings from VS Code storage
            const settings = getStructuredSettings();
            console.log('Sending settings to settings UI:', settings);
            
            // Always send settings, even if null
            panel.webview.postMessage({ 
              command: 'loadSettings', 
              settings: settings 
            });
            return;
          case 'saveSettings':
            // Save settings to VS Code storage
            console.log('Saving settings to global state:', message.settings);
            await context.globalState.update('aiAssistantSettings', message.settings);
            
            // Verify settings were saved correctly
            const savedSettings = context.globalState.get('aiAssistantSettings');
            console.log('Settings saved successfully:', savedSettings);
            
            vscode.window.showInformationMessage('AI Assistant settings saved successfully!');
            
            // Broadcast the updated settings to the chat view
            if (provider.view) {
              provider.view.webview.postMessage({ 
                command: 'settingsUpdated', 
                settings: message.settings 
              });
            }
            return;
          case 'cancel':
            // Close the panel
            panel.dispose();
            return;
        }
      },
      undefined,
      context.subscriptions
    );
  });

  const newChatCommand = vscode.commands.registerCommand("assistant.newChat", () => {
    // Send message to webview to start a new chat
    if (provider.view) {
      provider.view.webview.postMessage({ command: 'newChat' });
    } else {
      // Focus the chat view first, then create a new chat
      vscode.commands.executeCommand('chatUI.chatView.focus').then(() => {
        // Wait a bit for the view to initialize
        setTimeout(() => {
          if (provider.view) {
            provider.view.webview.postMessage({ command: 'newChat' });
          }
        }, 500);
      });
    }
  });

  let disposable = vscode.commands.registerCommand('assistant.showChatView', () => {
    // Focus the chat view
    vscode.commands.executeCommand('chatUI.chatView.focus');
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(showSettingsCommand);
  context.subscriptions.push(newChatCommand);
}

export function deactivate() {}

// Helper function to get settings UI HTML
function getSettingsHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  
  // Get the current settings from global state using the structured function
  const currentSettings = vscode.extensions.getExtension('globallogic.learning')?.exports.getStructuredSettings();
  
  // Create a JSON string of the current settings for initial loading
  const initialSettingsJson = currentSettings ? JSON.stringify(currentSettings) : 'null';
  
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src * https://api.openai.com https://generativelanguage.googleapis.com;">
    <title>AI Assistant Settings</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        margin: 0;
        padding: 0;
        display: flex;
        height: 100vh;
        overflow: hidden;
      }
      h1 {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--vscode-foreground);
      }
      .sidebar {
        width: 200px;
        background-color: var(--vscode-sideBar-background);
        height: 100%;
        overflow-y: auto;
        border-right: 1px solid var(--vscode-panel-border);
      }
      .sidebar-item {
        padding: 12px 16px;
        font-size: 14px;
        color: var(--vscode-foreground);
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: background-color 0.2s;
      }
      .sidebar-item:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      .sidebar-item.active {
        background-color: var(--vscode-list-activeSelectionBackground);
        color: var(--vscode-list-activeSelectionForeground);
        border-left-color: var(--vscode-focusBorder);
      }
      .main-content {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
      }
      .content-container {
        max-width: 800px;
        margin: 0 auto;
      }
      .section {
        margin-bottom: 30px;
        padding: 20px;
        background-color: var(--vscode-sideBar-background);
        border-radius: 6px;
        display: none;
      }
      .section.active {
        display: block;
      }
      .section-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 15px;
        color: var(--vscode-foreground);
      }
      .form-group {
        margin-bottom: 15px;
      }
      .form-row {
        display: flex;
        gap: 15px;
        margin-bottom: 15px;
      }
      .form-col {
        flex: 1;
      }
      label {
        display: block;
        margin-bottom: 6px;
        font-size: 14px;
        color: var(--vscode-foreground);
      }
      input[type="text"], input[type="password"], select {
        width: 100%;
        padding: 8px 10px;
        font-size: 14px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        height: 36px;
      }
      input[type="text"]:focus, input[type="password"]:focus, select:focus {
        border-color: var(--vscode-focusBorder);
      }
      button {
        padding: 8px 14px;
        font-size: 14px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 10px;
      }
      button:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      .button-secondary {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      .button-secondary:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }
      .button-container {
        margin-top: 20px;
      }
      .model-provider-section {
        margin-bottom: 30px;
        padding: 20px;
        background-color: var(--vscode-sideBar-background);
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <div class="sidebar">
      <div class="sidebar-item active" data-target="api-settings">API Configuration</div>
      <div class="sidebar-item" data-target="model-settings">Model Settings</div>
      <div class="sidebar-item" data-target="advanced-settings">Advanced Settings</div>
      <div class="sidebar-item" data-target="about">About</div>
    </div>
    
    <div class="main-content">
      <div class="content-container">
        <h1>AI Assistant Settings</h1>
        
        <div id="api-settings" class="section active">
          <div class="section-title">AI Model Configuration</div>
          
          <div class="form-row">
            <div class="form-col">
              <label for="default-provider">Default LLM Provider</label>
              <select id="default-provider">
                <option value="openai">OpenAI</option>
                <option value="gemini">Google Gemini</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>
          </div>
          
          <div class="section-title">OpenAI Configuration</div>
          <div class="form-row">
            <div class="form-col">
              <label for="openai-api-key">API Key</label>
              <input type="password" id="openai-api-key" placeholder="Enter OpenAI API Key">
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label for="openai-model">Model</label>
              <select id="openai-model">
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </select>
            </div>
            <div class="form-col">
              <label for="openai-provider">Provider</label>
              <select id="openai-provider">
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI</option>
              </select>
            </div>
          </div>
          
          <div class="section-title">Google Gemini Configuration</div>
          <div class="form-row">
            <div class="form-col">
              <label for="gemini-api-key">API Key</label>
              <input type="password" id="gemini-api-key" placeholder="Enter Gemini API Key">
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label for="gemini-model">Model</label>
              <select id="gemini-model">
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-pro-vision">Gemini Pro Vision</option>
                <option value="gemini-ultra">Gemini Ultra</option>
              </select>
            </div>
            <div class="form-col">
              <label for="gemini-provider">Provider</label>
              <select id="gemini-provider">
                <option value="google">Google AI</option>
                <option value="vertex">Google Vertex AI</option>
              </select>
            </div>
          </div>
          
          <div class="section-title">Ollama Configuration</div>
          <div class="form-row">
            <div class="form-col">
              <label for="ollama-base-url">Base URL</label>
              <input type="text" id="ollama-base-url" placeholder="http://localhost:11434" value="http://localhost:11434">
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label for="ollama-model">Default Model</label>
              <select id="ollama-model">
                <option value="llama2">llama2</option>
              </select>
            </div>
            <div class="form-col">
              <label for="ollama-provider">Provider</label>
              <select id="ollama-provider">
                <option value="local">Local Ollama</option>
                <option value="remote">Remote Ollama</option>
              </select>
            </div>
          </div>
        </div>
        
        <div id="model-settings" class="section">
          <div class="section-title">Model Settings</div>
          <p>Configure model-specific settings here.</p>
        </div>
        
        <div id="advanced-settings" class="section">
          <div class="section-title">Advanced Settings</div>
          <p>Configure advanced settings here.</p>
        </div>
        
        <div id="about" class="section">
          <div class="section-title">About</div>
          <p>AI Assistant extension for VS Code.</p>
          <p>Version: 1.0.0</p>
        </div>
        
        <div class="button-container">
          <button id="save-button">Save Settings</button>
          <button id="cancel-button" class="button-secondary">Cancel</button>
        </div>
      </div>
    </div>
    
    <script nonce="${nonce}">
      (function() {
        // Navigation handling
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        const sections = document.querySelectorAll('.section');
        
        sidebarItems.forEach(item => {
          item.addEventListener('click', () => {
            // Remove active class from all sidebar items
            sidebarItems.forEach(i => i.classList.remove('active'));
            // Add active class to clicked item
            item.classList.add('active');
            
            // Hide all sections
            sections.forEach(section => section.classList.remove('active'));
            // Show the corresponding section
            const targetId = item.getAttribute('data-target');
            if (targetId) {
              document.getElementById(targetId).classList.add('active');
            }
          });
        });
        
        // Function to fetch Ollama models
        async function fetchOllamaModels(baseUrl) {
          try {
            const url = \`\${baseUrl}/api/tags\`;
            console.log('Fetching Ollama models from:', url);
            
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(\`HTTP error! status: \${response.status}\`);
            }
            
            const data = await response.json();
            console.log('Ollama models:', data);
            
            // Get the ollama model select element and clear it
            const ollamaModelSelect = document.getElementById('ollama-model');
            ollamaModelSelect.innerHTML = '';
            
            if (data && data.models && data.models.length > 0) {
              // Add each model to the select
              data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.name;
                ollamaModelSelect.appendChild(option);
              });
              
              // Return first model name
              return data.models[0].name;
            } else {
              // If no models or empty response, add a default option
              const option = document.createElement('option');
              option.value = 'llama2';
              option.textContent = 'llama2';
              ollamaModelSelect.appendChild(option);
              
              return 'llama2';
            }
          } catch (error) {
            console.error('Error fetching Ollama models:', error);
            
            // In case of error, set default options
            const ollamaModelSelect = document.getElementById('ollama-model');
            ollamaModelSelect.innerHTML = '';
            
            const option = document.createElement('option');
            option.value = 'llama2';
            option.textContent = 'llama2';
            ollamaModelSelect.appendChild(option);
            
            const option2 = document.createElement('option');
            option2.value = 'mistral';
            option2.textContent = 'mistral';
            ollamaModelSelect.appendChild(option2);
            
            return 'llama2';
          }
        }
        
        // Get the VS Code API
        const vscode = acquireVsCodeApi();
        
        // Default settings structure
        const defaultSettings = {
          defaultProvider: 'openai',
          openai: { 
            apiKey: '', 
            modelName: 'gpt-3.5-turbo',
            provider: 'openai'
          },
          gemini: { 
            apiKey: '', 
            modelName: 'gemini-2.0-flash',
            provider: 'google'
          },
          ollama: { 
            baseUrl: 'http://localhost:11434', 
            modelName: 'llama2',
            provider: 'local'
          }
        };
        
        // Merge settings helper function to ensure full structure
        function mergeSettings(stored) {
          // If no settings, use defaults
          if (!stored) return { ...defaultSettings };
          
          // Create merged settings with all top-level properties
          const merged = { ...defaultSettings, ...stored };
          
          // Ensure all nested properties exist with correct defaults
          merged.openai = { ...defaultSettings.openai, ...merged.openai };
          merged.gemini = { ...defaultSettings.gemini, ...merged.gemini };
          merged.ollama = { ...defaultSettings.ollama, ...merged.ollama };
          
          return merged;
        }
        
        // Initialize with currentSettings from global state or default settings
        let initialSettings = ${initialSettingsJson};
        
        // Get settings from state (if any)
        const storedState = vscode.getState();
        
        // Merge settings from all sources with preferences:
        // 1. State (if exists)
        // 2. Initial settings from extension
        // 3. Default values
        let settings = mergeSettings(
          storedState?.settings || initialSettings
        );
        
        // Save the merged settings to state
        vscode.setState({ settings });
        
        // Listen for messages from the extension
        window.addEventListener('message', async (event) => {
          const message = event.data;
          
          if (message.command === 'loadSettings') {
            // Update the settings object with fresh data from extension
            const newSettings = message.settings;
            if (newSettings) {
              // Merge with defaults to ensure all properties exist
              settings = mergeSettings(newSettings);
              
              // Save to state
              vscode.setState({ settings });
              
              // Fill form fields with loaded settings
              populateFormFields();
              
              // Fetch Ollama models
              const ollamaBaseUrl = settings.ollama.baseUrl || 'http://localhost:11434';
              await fetchOllamaModels(ollamaBaseUrl);
              
              // Set the Ollama model value after populating the dropdown
              document.getElementById('ollama-model').value = settings.ollama.modelName || 'llama2';
            }
          }
        });
        
        // Function to populate form fields with current settings
        function populateFormFields() {
          document.getElementById('default-provider').value = settings.defaultProvider || 'openai';
          
          document.getElementById('openai-api-key').value = settings.openai.apiKey || '';
          document.getElementById('openai-model').value = settings.openai.modelName || 'gpt-3.5-turbo';
          document.getElementById('openai-provider').value = settings.openai.provider || 'openai';
          
          document.getElementById('gemini-api-key').value = settings.gemini.apiKey || '';
          document.getElementById('gemini-model').value = settings.gemini.modelName || 'gemini-2.0-flash';
          document.getElementById('gemini-provider').value = settings.gemini.provider || 'google';
          
          document.getElementById('ollama-base-url').value = settings.ollama.baseUrl || 'http://localhost:11434';
          document.getElementById('ollama-provider').value = settings.ollama.provider || 'local';
        }
        
        // Initialize form fields
        populateFormFields();
        
        // Load settings if they exist in state
        async function initializeModels() {
          try {
            // Fetch Ollama models with current base URL
            const ollamaBaseUrl = settings.ollama.baseUrl || 'http://localhost:11434';
            await fetchOllamaModels(ollamaBaseUrl);
            
            // Set the Ollama model value after populating the dropdown
            if (settings.ollama.modelName) {
              document.getElementById('ollama-model').value = settings.ollama.modelName;
            }
            
            // Notify extension that the webview is ready
            vscode.postMessage({ command: 'webviewReady' });
          } catch (error) {
            console.error('Error initializing models:', error);
          }
        }
        
        // Initialize models when page loads
        initializeModels();
        
        // Add event listener for Ollama base URL changes to refresh model list
        document.getElementById('ollama-base-url').addEventListener('change', async (event) => {
          const baseUrl = event.target.value;
          await fetchOllamaModels(baseUrl);
        });
        
        // Save button handler
        document.getElementById('save-button').addEventListener('click', () => {
          const updatedSettings = {
            defaultProvider: document.getElementById('default-provider').value,
            openai: {
              apiKey: document.getElementById('openai-api-key').value,
              modelName: document.getElementById('openai-model').value,
              provider: document.getElementById('openai-provider').value
            },
            gemini: {
              apiKey: document.getElementById('gemini-api-key').value,
              modelName: document.getElementById('gemini-model').value,
              provider: document.getElementById('gemini-provider').value
            },
            ollama: {
              baseUrl: document.getElementById('ollama-base-url').value,
              modelName: document.getElementById('ollama-model').value,
              provider: document.getElementById('ollama-provider').value
            }
          };
          
          // Update our settings object
          settings = updatedSettings;
          
          // Save to extension state
          vscode.setState({ settings });
          
          // Send to extension
          vscode.postMessage({
            command: 'saveSettings',
            settings: updatedSettings
          });
        });
        
        // Cancel button handler
        document.getElementById('cancel-button').addEventListener('click', () => {
          // Close the webview
          vscode.postMessage({
            command: 'cancel'
          });
        });
      })();
    </script>
  </body>
  </html>`;
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _getStructuredSettings: () => any
  ) {}

  // Add getter for the view
  public get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    
    // Send the initial settings to the webview
    const settings = this._getStructuredSettings();
    console.log('Initial settings for chat UI:', settings);
    
    // Small delay to ensure webview is ready to receive messages
    setTimeout(() => {
      if (this._view) {
        this._view.webview.postMessage({ 
          command: 'settingsUpdated', 
          settings: settings 
        });
      }
    }, 1000);

    // Listen for messages from the webview
    webviewView.webview.onDidReceiveMessage(
      message => {
        console.log('Received message from chat UI:', message.command);
        
        switch (message.command) {
          case 'alert':
            vscode.window.showErrorMessage(message.text);
            return;
          case 'openSettings':
            vscode.commands.executeCommand('assistant.showWebViewUi');
            return;
          case 'executeCommand':
            if (message.commandToExecute) {
              vscode.commands.executeCommand(message.commandToExecute);
            }
            return;
          case 'requestSettings':
            // Send the current settings from global state
            const currentSettings = this._getStructuredSettings();
            console.log('Sending requested settings to chat UI:', currentSettings);
            
            webviewView.webview.postMessage({ 
              command: 'settingsUpdated', 
              settings: currentSettings 
            });
            return;
        }
      },
      undefined,
      []
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Use a nonce to only allow a specific script to be run
    const nonce = getNonce();

    // Find the latest JS and CSS files in the assets directory
    const webviewPath = vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview-ui');
    const webviewPathStr = webviewPath.fsPath;
    
    // Get the path to the assets directory
    const assetsPath = join(webviewPathStr, 'assets');
    
    try {
      // Get all files in the assets directory
      const files = readdirSync(assetsPath);
      
      // Find the JS and CSS files
      const jsFile = files.find(file => file.endsWith('.js'));
      const cssFile = files.find(file => file.endsWith('.css'));

      if (!jsFile || !cssFile) {
        vscode.window.showErrorMessage('Could not find webview assets. Please rebuild the webview.');
        return `<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Error</title>
            </head>
            <body>
              <h1>Error: Missing Assets</h1>
              <p>Could not find the webview assets. Please rebuild the extension.</p>
            </body>
          </html>`;
      }

      // Create the URIs for the assets
      const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(webviewPath, 'assets', jsFile)
      );
      const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(webviewPath, 'assets', cssFile)
      );

      // Update the CSP to allow Ollama API calls
      return `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src * https://api.openai.com https://generativelanguage.googleapis.com;">
            <link rel="stylesheet" type="text/css" href="${styleUri}">
            <title>AI Assistant</title>
          </head>
          <body>
            <div id="root"></div>
            <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
          </body>
        </html>`;
    } catch (error) {
      console.error('Error loading webview assets:', error);
      return `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Error</title>
          </head>
          <body>
            <h1>Error</h1>
            <p>Could not load the webview assets. Error: ${error}</p>
          </body>
        </html>`;
    }
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
