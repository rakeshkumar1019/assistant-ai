import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState } from 'react'

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: function Code({ className, children }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !className || !match
            const isMultiline = children?.toString().includes('\n') || false
            
            if (!isInline && match) {
              // This is a code block with a specific language
              return <CodeBlock language={match[1]} content={String(children || '')} />
            } 
            
            if (isMultiline) {
              // This is a code block without a specific language
              return <CodeBlock language="text" content={String(children || '')} />
            }
            
            // This is an inline code element
            return (
              <code
                className={className}
                style={{
                  fontFamily: 'Menlo, Monaco, Courier New, monospace',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontSize: '90%',
                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                }}
              >
                {children}
              </code>
            )
          },
          p: function Paragraph({ children }) { 
            return <p style={{ margin: '0.5em 0' }}>{children}</p> 
          },
          ul: function UnorderedList({ children }) { 
            return <ul style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ul> 
          },
          ol: function OrderedList({ children }) { 
            return <ol style={{ margin: '0.5em 0', paddingLeft: '1.5em' }}>{children}</ol> 
          },
          li: function ListItem({ children }) { 
            return <li style={{ margin: '0.2em 0' }}>{children}</li> 
          },
          h1: function Heading1({ children }) { 
            return <h1 style={{ fontSize: '1.6em', fontWeight: 'bold', margin: '0.8em 0 0.4em 0' }}>{children}</h1> 
          },
          h2: function Heading2({ children }) { 
            return <h2 style={{ fontSize: '1.4em', fontWeight: 'bold', margin: '0.8em 0 0.4em 0' }}>{children}</h2> 
          },
          h3: function Heading3({ children }) { 
            return <h3 style={{ fontSize: '1.2em', fontWeight: 'bold', margin: '0.8em 0 0.4em 0' }}>{children}</h3> 
          },
          blockquote: function BlockQuote({ children }) { 
            return (
              <blockquote style={{ 
                borderLeft: '3px solid var(--vscode-panel-border)', 
                paddingLeft: '1em', 
                margin: '0.5em 0',
                color: 'var(--vscode-descriptionForeground)'
              }}>
                {children}
              </blockquote>
            )
          },
          table: function Table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '0.5em 0' }}>
                <table style={{ 
                  minWidth: '50%', 
                  borderCollapse: 'collapse',
                  fontSize: '0.9em'
                }}>
                  {children}
                </table>
              </div>
            )
          },
          th: function TableHeader({ children }) {
            return (
              <th style={{ 
                borderBottom: '1px solid var(--vscode-panel-border)', 
                padding: '0.5em',
                textAlign: 'left'
              }}>
                {children}
              </th>
            )
          },
          td: function TableCell({ children }) {
            return (
              <td style={{ 
                borderBottom: '1px solid var(--vscode-panel-border)', 
                padding: '0.5em',
                textAlign: 'left'
              }}>
                {children}
              </td>
            )
          },
          a: function Anchor({ children, href }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  color: 'var(--vscode-textLink-foreground)', 
                  textDecoration: 'none',
                  borderBottom: '1px solid currentColor'
                }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// Custom code block component with copy button
function CodeBlock({ language, content }: { language: string, content: string }) {
  const [isCopied, setIsCopied] = useState(false)
  
  // Extract filename if it exists in the form ```filename.ext or ```language:filename.ext
  let fileName = '';
  // Check for language:filename.ext format first
  const languageFileNameMatch = content.match(/^(\w+):([a-zA-Z0-9_\-./\\]+\.\w+)\n/);
  if (languageFileNameMatch) {
    language = languageFileNameMatch[1]; // Override language
    fileName = languageFileNameMatch[2];
    content = content.replace(languageFileNameMatch[0], ''); // Remove the language:filename from content
  } else {
    // Check for just filename.ext format
    const fileNameMatch = content.match(/^([a-zA-Z0-9_\-./\\]+\.\w+)\n/);
    if (fileNameMatch) {
      fileName = fileNameMatch[1];
      content = content.replace(fileNameMatch[0], ''); // Remove the filename from content
    }
  }
  
  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  // Determine the language display name - make it more user-friendly
  const getLanguageDisplayName = (lang: string) => {
    const languageMap: Record<string, string> = {
      js: 'JavaScript',
      ts: 'TypeScript',
      jsx: 'React JSX',
      tsx: 'React TSX',
      py: 'Python',
      rb: 'Ruby',
      java: 'Java',
      cs: 'C#',
      cpp: 'C++',
      php: 'PHP',
      go: 'Go',
      rs: 'Rust',
      swift: 'Swift',
      kt: 'Kotlin',
      sh: 'Shell',
      bash: 'Bash',
      html: 'HTML',
      css: 'CSS',
      scss: 'SCSS',
      sql: 'SQL',
      json: 'JSON',
      yml: 'YAML',
      yaml: 'YAML',
      md: 'Markdown',
      text: 'Plain Text'
    };
    
    return languageMap[lang] || lang.charAt(0).toUpperCase() + lang.slice(1);
  };
  
  return (
    <div style={{ 
      marginBottom: '16px',
      fontFamily: 'var(--vscode-editor-font-family, "Menlo", "Monaco", "Courier New", monospace)',
      fontSize: 'var(--vscode-editor-font-size, 13px)',
      lineHeight: 'var(--vscode-editor-line-height, 1.5)',
      border: '1px solid var(--vscode-editorWidget-border, rgba(127, 127, 127, 0.3))',
      borderRadius: '6px',
      overflow: 'hidden',
      backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
    }}>
      <div style={{ 
        backgroundColor: 'var(--vscode-tab-activeBackground, #1e1e1e)',
        paddingLeft: '10px',
        paddingRight: '10px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--vscode-tab-border, rgba(128, 128, 128, 0.2))'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          {fileName && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 7V17C3 19.2091 4.79086 21 7 21H17C19.2091 21 21 19.2091 21 17V9C21 6.79086 19.2091 5 17 5H5C3.89543 5 3 5.89543 3 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 7L9 7C10.1046 7 11 6.10457 11 5V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ 
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--vscode-tab-activeForeground, #ffffff)'
              }}>{fileName}</span>
            </div>
          )}
          {(language !== 'text') && (
            <div style={{
              fontSize: '11px',
              fontWeight: 400,
              color: 'var(--vscode-foreground, #cccccc)',
              opacity: 0.8,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{
                padding: '2px 5px',
                borderRadius: '3px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}>
                {getLanguageDisplayName(language)}
              </span>
            </div>
          )}
        </div>
        <button 
          title="Copy code" 
          onClick={handleCopy}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--vscode-icon-foreground, #cccccc)',
            opacity: 0.8,
            padding: '4px',
            borderRadius: '3px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31))'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {isCopied ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16M8 4H16C17.1046 4 18 4.89543 18 6V16C18 17.1046 17.1046 18 16 18H8C6.89543 18 6 17.1046 6 16V6C6 4.89543 6.89543 4 8 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
          <span style={{ 
            position: 'absolute', 
            width: '1px', 
            height: '1px', 
            padding: '0', 
            margin: '-1px', 
            overflow: 'hidden', 
            clip: 'rect(0, 0, 0, 0)', 
            border: '0' 
          }}>
            {isCopied ? 'Copied!' : 'Copy code'}
          </span>
        </button>
      </div>
      
      <div style={{ position: 'relative' }}>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '12px 16px',
            backgroundColor: 'var(--vscode-editor-background, #1e1e1e)',
            borderRadius: '0 0 6px 6px',
            fontSize: '13px',
            lineHeight: '1.5',
            overflowX: 'auto'
          }}
        >
          {content}
        </SyntaxHighlighter>
      </div>
    </div>
  )
} 