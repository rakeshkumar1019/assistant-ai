# Assistant Code AI

A powerful AI assistant extension for Visual Studio Code that brings the capabilities of various AI models directly into your coding environment.

## Features

- **Integrated AI Chat**: Chat with AI assistants directly in your VSCode interface
- **Multiple AI Providers**: Support for various AI models:
  - OpenAI (GPT models)
  - Google Gemini
  - Ollama (for local models)
- **Convenient UI**: Accessible from the activity bar with a dedicated chat view
- **Contextual Assistance**: Get coding help, explanations, and suggestions based on your current workspace
- **Customizable Settings**: Configure your preferred AI provider and model

## Installation

1. Install from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/)
2. Search for "Assistant Code AI" in the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`)
3. Click Install

## Getting Started

1. After installation, you'll see a new AI icon in the VSCode activity bar
2. Click on it to open the chat interface
3. Configure your API keys and settings by clicking on the settings icon
4. Start a new chat with the "New Chat" button

## Configuration

### Setting up API Keys

1. Click on the Settings icon in the AI Assistant panel
2. Enter your API keys for your preferred providers:
   - OpenAI API key
   - Google Gemini API key
   - Configure Ollama base URL (default: http://localhost:11434)
3. Select your default model for each provider

### Configuration Options

- **Default Provider**: Choose between OpenAI, Gemini, or Ollama
- **Model Selection**: Choose different models based on your needs
- **Ollama Configuration**: Set custom endpoint for your local Ollama instance

## Usage

- **Start a New Chat**: Click the "+" icon to start a fresh conversation
- **Ask Questions**: Type your coding questions, requests for explanations, or any other queries
- **Switch Providers**: Change between different AI providers based on your needs

## Requirements

- Visual Studio Code version 1.89.0 or higher
- Internet connection for OpenAI and Gemini (Ollama works locally)
- API keys for commercial providers (OpenAI, Google)

## Privacy & Data

- Your code and conversations are processed according to the privacy policies of the AI provider you select
- For local processing, you can use Ollama with no data sent to external services
- This extension does not collect or store your API keys or conversations on any external servers

## Support & Feedback

- [GitHub Issues](https://github.com/rakeshkumar1019/assistant-ai/issues)
- [GitHub Repository](https://github.com/rakeshkumar1019/assistant-ai)

## License

This extension is licensed under [MIT License](LICENSE).