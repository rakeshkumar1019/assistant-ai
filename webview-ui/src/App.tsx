import './App.css'
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, X, Loader2, MessageSquare, RefreshCw} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { AIService } from "@/services/api/aiService"
import { Message, ProviderConfig, Provider } from "@/services/api/types"
import { Markdown } from './components/ui/markdown'

// Add some fallback CSS variables for VS Code theme
const injectFallbackCSSVariables = () => {
  const root = document.documentElement;
  const variables = {
    '--vscode-editor-background': '#1e1e1e',
    '--vscode-editor-foreground': '#d4d4d4',
    '--vscode-sideBar-background': '#252526',
    '--vscode-panel-border': '#3c3c3c',
    '--vscode-input-background': '#3c3c3c',
    '--vscode-input-foreground': '#cccccc',
    '--vscode-input-border': '#3c3c3c',
    '--vscode-dropdown-background': '#3c3c3c', 
    '--vscode-dropdown-foreground': '#f0f0f0',
    '--vscode-dropdown-border': '#3c3c3c',
    '--vscode-button-background': '#0e639c',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-secondaryBackground': '#3a3d41',
    '--vscode-descriptionForeground': '#989898',
    '--vscode-errorForeground': '#f48771',
    '--vscode-errorBackground': '#5a1d1d',
    '--vscode-foreground': '#cccccc',
    '--vscode-gitDecoration-addedResourceForeground': '#81b88b',
    '--vscode-gitDecoration-modifiedResourceForeground': '#e2c08d',
    '--vscode-chat-messageSupportBackground': '#252526'
  };

  // Only set if not already defined
  Object.entries(variables).forEach(([key, value]) => {
    const currentValue = getComputedStyle(root).getPropertyValue(key);
    if (!currentValue || currentValue === '') {
      root.style.setProperty(key, value);
    }
  });
};

// Add declaration for vsCodeApi on window object
declare global {
  interface Window {
    vsCodeApi?: {
      postMessage(message: Record<string, unknown>): void;
      getState(): unknown;
      setState(state: unknown): void;
    };
    acquireVsCodeApi?: () => typeof window.vsCodeApi;
  }
}

function App() {
  // Apply fallback variables
  useEffect(() => {
    injectFallbackCSSVariables();
  }, []);

  const aiService = AIService.getInstance()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<Provider>('ollama')
  const [providerConfigs, setProviderConfigs] = useState<Record<Provider, ProviderConfig>>({
    openai: { apiKey: '', modelName: 'gpt-3.5-turbo' },
    gemini: { apiKey: '', modelName: 'gemini-pro' },
    ollama: { apiKey: '', modelName: 'llama2' }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [lastUserMessage, setLastUserMessage] = useState<string>('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea based on content
  const autoResizeTextarea = () => {
    if (textareaRef.current) {
      // Reset height to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      
      // Calculate new height (with a max of 200px)
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
      
      // Set the new height
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }

  // Apply auto-resize when input changes
  useEffect(() => {
    autoResizeTextarea();
  }, [input]);

  // Request settings from VS Code when the app loads
  useEffect(() => {
    // Use a small delay to ensure VS Code extension is ready
    const timer = setTimeout(() => {
      if (window.vsCodeApi) {
        // Request settings from the extension
        window.vsCodeApi.postMessage({ command: 'requestSettings' });
        console.log('Requested settings from VS Code extension');
      } else {
        console.warn('vsCodeApi not available');
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // Unified message handler for all extension messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      // Skip if not a valid message
      if (!message || !message.command) return;
      
      console.log('Received message from extension:', message.command);
      
      switch (message.command) {
        case 'newChat':
          // Handle new chat
          setMessages([]);
          setInput('');
          setStreamingContent('');
          setLastUserMessage('');
          break;
          
        case 'settingsUpdated':
          // Handle settings update
          if (message.settings) {
            const settings = message.settings;
            console.log('Received settings update:', settings);
            
            // Update the provider based on default provider
            if (settings.defaultProvider) {
              console.log('Setting default provider to:', settings.defaultProvider);
              setSelectedProvider(settings.defaultProvider as Provider);
            }
            
            // Update provider configs without depending on current state
            setProviderConfigs(currentConfigs => {
              const updatedConfigs = { ...currentConfigs };
              
              // Update OpenAI settings
              if (settings.openai) {
                const apiKey = settings.openai.apiKey ?? updatedConfigs.openai.apiKey;
                console.log('Setting OpenAI API key:', apiKey ? (apiKey.length > 0 ? 'Key provided (redacted)' : 'Empty key') : 'No key');
                
                updatedConfigs.openai = {
                  ...updatedConfigs.openai,
                  apiKey: apiKey,
                  modelName: settings.openai.modelName ?? updatedConfigs.openai.modelName
                };
              }
              
              // Update Gemini settings
              if (settings.gemini) {
                const apiKey = settings.gemini.apiKey ?? updatedConfigs.gemini.apiKey;
                console.log('Setting Gemini API key:', apiKey ? (apiKey.length > 0 ? 'Key provided (redacted)' : 'Empty key') : 'No key');
                
                updatedConfigs.gemini = {
                  ...updatedConfigs.gemini,
                  apiKey: apiKey,
                  modelName: settings.gemini.modelName ?? updatedConfigs.gemini.modelName
                };
              }
              
              // Update Ollama settings
              if (settings.ollama) {
                console.log('Setting Ollama model:', settings.ollama.modelName ?? updatedConfigs.ollama.modelName);
                
                updatedConfigs.ollama = {
                  ...updatedConfigs.ollama,
                  apiKey: settings.ollama.apiKey ?? updatedConfigs.ollama.apiKey,
                  modelName: settings.ollama.modelName ?? updatedConfigs.ollama.modelName
                };
              }
              
              console.log('Updated provider configs:', JSON.stringify({
                openai: { ...updatedConfigs.openai, apiKey: updatedConfigs.openai.apiKey ? '***redacted***' : '' },
                gemini: { ...updatedConfigs.gemini, apiKey: updatedConfigs.gemini.apiKey ? '***redacted***' : '' },
                ollama: updatedConfigs.ollama
              }));
              
              return updatedConfigs;
            });
          }
          break;
          
        default:
          console.log('Unhandled message command:', message.command);
      }
    };
    
    // Add a single message listener for all extension communications
    window.addEventListener('message', handleMessage);
    
    // Clean up
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent])

  const handleRegenerate = async () => {
    if (isLoading || !lastUserMessage) return;
    
    setInput('');
    setIsLoading(true);
    setStreamingContent('');
    
    // Remove the last assistant message if it exists
    const filteredMessages = [...messages];
    if (filteredMessages.length > 0 && filteredMessages[filteredMessages.length - 1].role === 'assistant') {
      filteredMessages.pop();
    }
    setMessages(filteredMessages);
    
    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController();
    
    const userMessage: Message = {
      role: 'user',
      content: lastUserMessage,
      provider: selectedProvider,
      timestamp: new Date().toISOString()
    };
    
    try {
      const response = await aiService.sendMessage(
        selectedProvider,
        userMessage,
        providerConfigs[selectedProvider],
        (content) => setStreamingContent(content)
      );
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        provider: selectedProvider,
        timestamp: new Date().toISOString()
      };
      
      setMessages([...filteredMessages, assistantMessage]);
      setStreamingContent('');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStreamingContent('');
        return;
      }
      const errorMessage: Message = {
        role: 'assistant',
        content: '',
        error: error instanceof Error ? error.message : 'An error occurred',
        provider: selectedProvider,
        timestamp: new Date().toISOString()
      };
      setMessages([...filteredMessages, errorMessage]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userInput = input.trim();
    setLastUserMessage(userInput);

    const userMessage: Message = {
      role: 'user',
      content: userInput,
      provider: selectedProvider,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setStreamingContent('')

    // Create a new AbortController for this request
    abortControllerRef.current = new AbortController()

    try {
      const response = await aiService.sendMessage(
        selectedProvider,
        userMessage,
        providerConfigs[selectedProvider],
        (content) => setStreamingContent(content)
      )

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
        provider: selectedProvider,
        timestamp: new Date().toISOString()
      }

      setMessages(prev => [...prev, assistantMessage])
      setStreamingContent('')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStreamingContent('')
        return
      }
      const errorMessage: Message = {
        role: 'assistant',
        content: '',
        error: error instanceof Error ? error.message : 'An error occurred',
        provider: selectedProvider,
        timestamp: new Date().toISOString()
      }
      setMessages(prev => [...prev, errorMessage])
      setStreamingContent('')
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      setStreamingContent('')
    }
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      overflow: 'hidden'
    }}>
      {/* Messages container */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '16px', 
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '70px' // Add bottom margin to make room for fixed textarea
      }}>
        <div style={{ flex: 1 }}>
          {messages.length === 0 ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              padding: '20px'
            }}>
              <MessageSquare 
                size={48} 
                style={{ 
                  marginBottom: '16px',
                  opacity: 0.7,
                  color: 'var(--vscode-foreground)'
                }} 
              />
              <h2 style={{ 
                fontSize: '18px', 
                fontWeight: 500,
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                How can I help you today?
              </h2>
              <p style={{ 
                fontSize: '14px', 
                color: 'var(--vscode-descriptionForeground)',
                textAlign: 'center',
                maxWidth: '500px',
                lineHeight: '1.5'
              }}>
                Ask me anything about your code, debugging, or development tasks.
              </p>
            </div>
          ) : (
            messages.map((message, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  marginBottom: '8px',
                  position: 'relative'
                }}
              >
                <div style={{
                  fontWeight: 600,
                  fontSize: '12px',
                  marginBottom: '6px',
                  color: message.role === 'user' 
                    ? 'var(--vscode-gitDecoration-addedResourceForeground)' 
                    : 'var(--vscode-gitDecoration-modifiedResourceForeground)',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>{message.role === 'user' ? 'You' : 'AI Assistant'}</span>
                  
                  {/* Regenerate button */}
                  {message.role === 'assistant' && index === messages.length - 1 && !isLoading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRegenerate}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '0 6px',
                        height: '20px',
                        fontSize: '11px',
                        background: 'transparent',
                        color: 'var(--vscode-foreground)',
                        opacity: 0.7
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                    >
                      <RefreshCw size={12} />
                      <span>Regenerate</span>
                    </Button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    lineHeight: '1.5'
                  }}
                >
                  {message.error ? (
                    <span style={{ color: 'var(--vscode-errorForeground)' }}>{message.error}</span>
                  ) : (
                    <Markdown content={message.content} />
                  )}
                </div>
              </div>
            ))
          )}
          
          {/* Streaming content */}
          {streamingContent && (
            <div 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                marginBottom: '8px' 
              }}
            >
              <div style={{
                fontWeight: 600,
                fontSize: '12px',
                marginBottom: '6px',
                color: 'var(--vscode-gitDecoration-modifiedResourceForeground)'
              }}>
                AI Assistant
              </div>
              <div style={{
                fontSize: '13px',
                lineHeight: '1.5'
              }}>
                <Markdown content={streamingContent} />
              </div>
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && !streamingContent && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
              <div style={{
                fontWeight: 600,
                fontSize: '12px',
                marginBottom: '6px',
                color: 'var(--vscode-gitDecoration-modifiedResourceForeground)'
              }}>
                AI Assistant
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: 'var(--vscode-descriptionForeground)'
              }}>
                <Loader2 size={14} className="animate-spin" />
                <span>Generating response...</span>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      {/* Input area - fixed to bottom */}
      <div style={{ 
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '5px 10px 10px 10px',
        backgroundColor: 'var(--vscode-editor-background)',
        zIndex: 50
      }}>
        <div style={{ position: 'relative' }}>
          <Textarea
            className="input-textarea"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            style={{ 
              width: '100%', 
              minHeight: '60px', 
              height: 'auto',
              maxHeight: '200px', 
              resize: 'none',
              paddingRight: '48px',
              paddingBottom: '30px', // Add extra padding at bottom for model info
              borderRadius: '4px',
              border: '1px solid var(--vscode-input-border)',
              backgroundColor: 'var(--vscode-input-background)',
              color: 'var(--vscode-input-foreground)',
              fontSize: '13px',
              transition: 'border-color 0.2s, height 0.1s'
            }}
            ref={textareaRef}
          />
          
          {/* Display model info below textarea */}
          <div style={{
            fontSize: '11px',
            color: 'var(--vscode-descriptionForeground)',
            position: 'absolute',
            bottom: '8px',
            left: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--vscode-input-background)',
            padding: '2px 5px',
            borderRadius: '3px',
            zIndex: 5
          }}>
            <span>
              {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}: {providerConfigs[selectedProvider].modelName}
            </span>
          </div>
          
          {isLoading ? (
            <Button
              style={{ 
                position: 'absolute', 
                right: '12px', 
                bottom: 'calc(50% - 5px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                borderRadius: '4px',
                background: 'var(--vscode-errorBackground)',
                color: 'var(--vscode-errorForeground)',
                cursor: 'pointer',
                border: 'none',
                padding: '0',
                zIndex: 10
              }}
              onClick={handleAbort}
            >
              <X size={14} />
            </Button>
          ) : (
            <>
              {messages.length > 0 && lastUserMessage && (
                <Button
                  style={{ 
                    position: 'absolute', 
                    right: '42px', 
                    bottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-foreground)',
                    cursor: 'pointer',
                    border: 'none',
                    padding: '0',
                    opacity: 0.8,
                    transition: 'opacity 0.2s',
                    zIndex: 10
                  }}
                  onClick={handleRegenerate}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  title="Regenerate response"
                >
                  <RefreshCw size={12} />
                </Button>
              )}
              <Button
                style={{ 
                  position: 'absolute', 
                  right: '10px', 
                  bottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: '4px',
                  background: input.trim() 
                    ? 'var(--vscode-button-background)' 
                    : 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-foreground)',
                  cursor: input.trim() ? 'pointer' : 'not-allowed',
                  border: 'none',
                  padding: '0',
                  opacity: input.trim() ? 1 : 0.6,
                  transition: 'opacity 0.2s, background-color 0.2s',
                  zIndex: 10
                }}
                onClick={handleSend}
                disabled={!input.trim()}
              >
                <Send size={14} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
