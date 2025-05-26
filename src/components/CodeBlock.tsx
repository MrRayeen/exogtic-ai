// === File: src/components/CodeBlock.tsx ===
"use client";

import React, { useState } from 'react';
// Using PrismAsyncLight for potentially smaller bundles; you might need to register languages
import { PrismAsyncLight as SyntaxHighlighter } from 'react-syntax-highlighter';
// Popular dark theme for syntax highlighting
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'; 
// Example: If you want to explicitly support python, js, tsx
// import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
// import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
// import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';

// SyntaxHighlighter.registerLanguage('python', python);
// SyntaxHighlighter.registerLanguage('jsx', jsx);
// SyntaxHighlighter.registerLanguage('typescript', typescript);


interface CodeBlockProps {
  // These props are passed by react-markdown for `code` elements
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ className, children }) => {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1] ? match[1] : 'text'; // Default to 'text' if no language found
  const codeString = String(children).replace(/\n$/, ''); // Remove trailing newline

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy code: ', err);
    });
  };

  // This component instance is for FENCED CODE BLOCKS (```language ... ```)
  // Inline code will be handled differently in the ReactMarkdown components prop.
  return (
    <div className="code-block-container my-2 bg-black/30 backdrop-blur-sm rounded-md overflow-hidden border border-purple-500/30 shadow-lg relative group">
      <div className="flex justify-between items-center px-3 py-1.5 bg-gray-800/60 border-b border-purple-500/30">
        <span className="text-xs text-purple-300 font-mono">{lang}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-purple-300 transition-colors px-2 py-0.5 rounded bg-gray-700/50 hover:bg-gray-600/70 opacity-50 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={atomDark} // Using atomDark style
        language={lang}
        PreTag="div" // Use a div for the outer element of SyntaxHighlighter
        className="text-sm p-3 custom-scrollbar !bg-transparent" // Make SyntaxHighlighter's own background transparent
        showLineNumbers={codeString.split('\n').length > 3} // Show line numbers for more than 3 lines
        wrapLines={true}
        lineNumberStyle={{ color: '#5c6370', fontSize: '0.8em', minWidth: '2.25em' }} // Style for line numbers
        codeTagProps={{ style: { fontFamily: "var(--font-jetbrains-mono, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace)", fontSize: '0.875rem' } }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;