export type Provider = 'openai' | 'gemini' | 'ollama'

export interface ProviderSettings {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  provider?: Provider
  timestamp?: string
  error?: string
}

export interface ProviderConfig {
  apiKey: string
  modelName: string
}

export interface OllamaModel {
  name: string
  modified_at: string
  size: number
}

export interface ApiError extends Error {
  status?: number
  code?: string
}

export interface OpenAIMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
  }>
}

export interface OllamaResponse {
  response: string
}

export const OPENAI_MODELS = [
  'gpt-4-turbo-preview',
  'gpt-4',
  'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k'
] as const

export const GEMINI_MODELS = [
  'gemini-pro',
  'gemini-pro-vision'
] as const

export type OpenAIModel = typeof OPENAI_MODELS[number]
export type GeminiModel = typeof GEMINI_MODELS[number] 