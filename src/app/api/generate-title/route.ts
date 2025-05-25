// === File: app/api/generate-title/route.ts ===
import { NextRequest, NextResponse } from 'next/server';

// Remember the user mentioned model name: gemma3:4b-it-qat
const OLLAMA_MODEL_FOR_TITLING = 'gemma3:4b-it-qat';

const TITLE_GENERATION_SYSTEM_PROMPT = `You are an expert at creating concise, relevant titles for conversations.
Based on the following conversation excerpt, provide a short title (ideally 3-5 words, maximum 7 words) that accurately captures the main topic or theme.
Do not add any conversational fluff, quotation marks, or prefixes like "Title:". Just return the plain text title.
For example, if the conversation is about dog training, a good title might be "Dog Training Tips" or "Puppy Behavior Issues".
If the conversation is vague or just greetings, a suitable title might be "General Chat" or "Catching Up".

Conversation Excerpt:
---
`; // The conversation snippet will be appended here by the backend

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationSnippet, model = OLLAMA_MODEL_FOR_TITLING } = body;

    if (!conversationSnippet) {
      return NextResponse.json({ error: 'Conversation snippet is required' }, { status: 400 });
    }

    const fullPromptForTitling = `${TITLE_GENERATION_SYSTEM_PROMPT}${conversationSnippet}\n---`;

    const ollamaPayload = {
      model: model,
      prompt: fullPromptForTitling,
      system: "You are a helpful assistant tasked with generating concise titles.", // A light system prompt for the call itself
      stream: false, // We want a single response for the title
      options: { // Fine-tune parameters for short, specific output
        num_predict: 20, // Max tokens for the title
        temperature: 0.3, // Lower temperature for more deterministic titles
        top_p: 0.9,
      }
    };

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaPayload),
    });

    if (!ollamaResponse.ok) {
      const errorBody = await ollamaResponse.text();
      console.error('Ollama API error during title generation:', errorBody);
      return NextResponse.json(
        { error: `Ollama API Error: ${ollamaResponse.statusText}`, details: errorBody },
        { status: ollamaResponse.status }
      );
    }

    const ollamaJson = await ollamaResponse.json();
    
    // Clean up the title: remove potential quotes, trim whitespace
    let generatedTitle = ollamaJson.response?.trim() || 'Chat Summary';
    generatedTitle = generatedTitle.replace(/^["']|["']$/g, ''); // Remove surrounding quotes

    // Basic filter for very short/generic responses if the model struggles
    if (generatedTitle.toLowerCase() === "title" || generatedTitle.length < 3) {
        generatedTitle = "Chat Summary"; // Fallback title
    }


    return NextResponse.json({ title: generatedTitle });

  } catch (error: any) {
    console.error('API Route /api/generate-title Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error in title generation API route', details: error.message },
      { status: 500 }
    );
  }
}