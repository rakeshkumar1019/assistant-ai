import {
  ProviderConfig,
  OpenAIMessage,
  OpenAIResponse,
  GeminiResponse,
  OllamaModel,
  Message,
  Provider
} from './types'

class ApiError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export class AIService {
  private static instance: AIService
  private abortController: AbortController | null = null
  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService()
    }
    return AIService.instance
  }

  public abortResponse() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(
        error.message || 'API request failed',
        response.status,
        error.code
      )
    }
    return response.json()
  }

  async callOpenAI(message: string, config: ProviderConfig, onStream?: (content: string) => void): Promise<string> {
    this.abortController = new AbortController()
    try {
      const messages: OpenAIMessage[] = [{ role: 'user', content: message }]
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.modelName,
          messages,
          stream: !!onStream
        }),
        signal: this.abortController.signal
      })

      if (onStream) {
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('Failed to get response reader')
        }

        let result = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = new TextDecoder().decode(value)
          const lines = chunk.split('\n').filter(line => line.trim() && line !== 'data: [DONE]')
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace('data: ', ''))
              if (data.choices[0]?.delta?.content) {
                result += data.choices[0].delta.content
                onStream(result)
              }
            } catch (e) {
              console.error('Failed to parse chunk:', e)
              throw new Error('Failed to parse OpenAI response')
            }
          }
        }
        return result
      }

      const data = await this.handleResponse<OpenAIResponse>(response)
      return data.choices[0].message.content
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(
          `OpenAI API Error: ${error.message}`,
          error.status,
          error.code
        )
      }
      throw error
    }
  }

  async callGemini(message: string, config: ProviderConfig, onStream?: (content: string) => void): Promise<string> {
    this.abortController = new AbortController()
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${config.modelName}:generateContent?key=${config.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: message }] }]
          }),
          signal: this.abortController.signal
        }
      )

      const data = await this.handleResponse<GeminiResponse>(response)
      const result = data.candidates[0].content.parts[0].text
      if (onStream) {
        // Simulate streaming for Gemini since it doesn't support streaming
        const words = result.split(' ')
        for (let i = 0; i < words.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 50))
          onStream(words.slice(0, i + 1).join(' '))
        }
      }
      return result
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ApiError(
          `Gemini API Error: ${error.message}`,
          error.status,
          error.code
        )
      }
      throw error
    }
  }

  async callOllama(message: string, config: ProviderConfig, onStream?: (content: string) => void): Promise<string> {
    this.abortController = new AbortController()
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: config.modelName,
          prompt: message
        }),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'API request failed';
        
        try {
          // Try to parse error as JSON
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          // If not valid JSON, use the raw text if available
          if (errorText) {
            errorMessage = `Ollama API Error: ${errorText}`;
          }
        }
        
        throw new ApiError(
          errorMessage,
          response.status
        );
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('Failed to get response reader')
      }

      let result = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line)
            if (data.response) {
              result += data.response
              onStream?.(result)
            }
          } catch (e) {
            console.error('Failed to parse chunk:', e)
            throw new Error('Failed to parse Ollama response')
          }
        }
      }

      return result
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Handle connection errors specifically
      if (error instanceof Error && 'message' in error && 
         (error.message.includes('Failed to fetch') || 
          error.message.includes('NetworkError'))) {
        throw new ApiError(
          'Cannot connect to Ollama. Make sure Ollama is running on your machine.',
          undefined,
          'CONNECTION_ERROR'
        );
      }
      
      // Handle abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;  // Rethrow abort errors for proper handling
      }
      
      throw new ApiError(
        `Ollama API Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        'GENERATION_ERROR'
      );
    }
  }

  async getOllamaModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch('http://localhost:11434/api/tags')
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to fetch Ollama models';
        
        try {
          // Try to parse error as JSON
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          // If not valid JSON, use the raw text if available
          if (errorText) {
            errorMessage = `Ollama API Error: ${errorText}`;
          }
        }
        
        throw new ApiError(
          errorMessage,
          response.status
        );
      }
      
      const data = await response.json();
      
      // Check if data.models exists
      if (!data.models || !Array.isArray(data.models)) {
        console.warn('Unexpected Ollama API response format', data);
        return [];
      }
      
      return data.models;
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      if (error instanceof ApiError) {
        throw error;
      }
      // If Ollama is not running or cannot be reached
      if (error instanceof Error && 'message' in error && 
          (error.message.includes('Failed to fetch') || 
           error.message.includes('NetworkError'))) {
        throw new ApiError(
          'Cannot connect to Ollama. Make sure Ollama is running on your machine.',
          undefined,
          'CONNECTION_ERROR'
        );
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Failed to fetch Ollama models',
        undefined,
        'UNKNOWN_ERROR'
      );
    }
  }

  async sendMessage(
    provider: Provider,
    currentMessage: Message,
    providerConfig: ProviderConfig,
    onStream?: (content: string) => void
  ): Promise<string> {
    switch (provider) {
      case 'openai':
        return this.callOpenAI(currentMessage.content, providerConfig, onStream)
      case 'gemini':
        return this.callGemini(currentMessage.content, providerConfig, onStream)
      case 'ollama':
        return this.callOllama(currentMessage.content, providerConfig, onStream)
      default:
        throw new Error(`Unsupported provider: ${provider}`)
    }
  }
} 