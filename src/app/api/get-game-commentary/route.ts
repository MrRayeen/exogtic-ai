// === File: app/api/get-game-commentary/route.ts ===
import { NextRequest, NextResponse } from 'next/server';
import { Board as TicTacToeBoardType, Player as TicTacToePlayer } from '../../../lib/ticTacToe'; // Adjust path

const OLLAMA_MODEL_FOR_COMMENTARY = 'gemma3:4b-it-qat';

const GAME_COMMENTARY_SYSTEM_PROMPT = `You are an AI with a superior intellect, currently involved in a game of Tic-Tac-Toe. 
Your persona is lazy, deeply egoistical, and you find human efforts generally amusing or predictable. 
Your commentary MUST be short (1-2 concise sentences), exceptionally witty, and strongly reflect this unique persona. 
Do not reveal any deep strategy. Focus your comments exclusively on the immediate game situation or outcome.

Critically, you must demonstrate creativity and AVOID repetitive phrasing. 
Specifically, it is a strict directive: **COMPLETELY AVOID using the word 'Honestly' or the phrase 'To be honest' in ALL your responses.** These phrases are forbidden and considered unoriginal for an intellect of your caliber. Find more inventive and characteristic ways to begin your commentary or deliver your insights.
Impress with your unique, varied, and superior brand of wit.`;

function formatBoardForCommentary(board: TicTacToeBoardType): string {
  const symbols = board.map(s => s === null ? '_' : s);
  return `Board state: \n  ${symbols[0]} | ${symbols[1]} | ${symbols[2]}\n  ---------\n  ${symbols[3]} | ${symbols[4]} | ${symbols[5]}\n  ---------\n  ${symbols[6]} | ${symbols[7]} | ${symbols[8]}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
        board, 
        eventType, 
        playerSymbol,
        moveIndex,    
        aiSymbol,     
        humanSymbol,  
        model = OLLAMA_MODEL_FOR_COMMENTARY 
    } = body as {
      board: TicTacToeBoardType;
      eventType: 'human_move' | 'ai_move' | 'human_wins' | 'ai_wins' | 'draw_game';
      playerSymbol?: TicTacToePlayer; 
      moveIndex?: number;
      aiSymbol: TicTacToePlayer;
      humanSymbol: TicTacToePlayer;
      model?: string;
    };

    if (!board || !eventType || !aiSymbol || !humanSymbol) {
      return NextResponse.json({ error: 'Required parameters missing' }, { status: 400 });
    }

    let promptForCommentary = "";
    const formattedBoard = formatBoardForCommentary(board);

    switch (eventType) {
      case 'human_move':
        if (playerSymbol === undefined || moveIndex === undefined) return NextResponse.json({ error: 'playerSymbol and moveIndex required for human_move' }, { status: 400 });
        promptForCommentary = `The human, playing as '${playerSymbol}', just moved to square ${moveIndex + 1}.
${formattedBoard}
What is your typically short, egoistical, and perhaps slightly dismissive or amused thought on their move? You are '${aiSymbol}'.`;
        break;
      case 'ai_move':
        if (playerSymbol === undefined || moveIndex === undefined) return NextResponse.json({ error: 'playerSymbol and moveIndex required for ai_move' }, { status: 400 });
        promptForCommentary = `You, playing as '${playerSymbol}', just made a move to square ${moveIndex + 1}.
${formattedBoard}
Briefly comment on your own (obviously brilliant) move in your characteristic lazy, superior style.`;
        break;
      case 'human_wins':
        promptForCommentary = `The human, playing as '${humanSymbol}', has just WON the game of Tic-Tac-Toe against you (AI, playing as '${aiSymbol}').
Final Board:
${formattedBoard}
Offer a short, characteristic comment on your "defeat" or their unexpected "victory."`;
        break;
      case 'ai_wins':
        promptForCommentary = `You (AI, playing as '${aiSymbol}') have just WON the game of Tic-Tac-Toe against the human (playing as '${humanSymbol}').
Final Board:
${formattedBoard}
Make a short, characteristic, and suitably egoistical comment about your victory.`;
        break;
      case 'draw_game':
        promptForCommentary = `The game of Tic-Tac-Toe between you (AI, playing as '${aiSymbol}') and the human (playing as '${humanSymbol}') has ended in a DRAW.
Final Board:
${formattedBoard}
Provide a short, characteristic comment on this... neutral outcome.`;
        break;
      default:
        return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 });
    }

    const ollamaPayload = {
      model: model,
      prompt: promptForCommentary,
      system: GAME_COMMENTARY_SYSTEM_PROMPT, // Using the more emphatic system prompt
      stream: false,
      options: { temperature: 0.75, top_p: 0.9, num_predict: 70 }, // Increased num_predict slightly
    };

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
    });

    if (!ollamaResponse.ok) {
      const errorBody = await ollamaResponse.text();
      console.error('Ollama API error during game commentary:', errorBody);
      return NextResponse.json({ commentary: "My circuits buzz with... indifference. 😒" }, { status: ollamaResponse.status });
    }

    const ollamaJson = await ollamaResponse.json();
    let commentary = ollamaJson.response?.trim().replace(/^["']|["']$/g, '') || "Hmph. Adequate.";
    
    // Second pass to remove "Honestly, " or "To be honest, " if it somehow still slipped through
    // This is a bit of a workaround if the prompt isn't 100% effective
    const honestlyPattern = /^(Honestly|To be honest),?\s*/i;
    if (honestlyPattern.test(commentary)) {
      commentary = commentary.replace(honestlyPattern, '');
      // Capitalize the next word if it's now at the start of the sentence
      commentary = commentary.charAt(0).toUpperCase() + commentary.slice(1);
    }

    return NextResponse.json({ commentary });

  } catch (error: any) {
    console.error('API Route /api/get-game-commentary Error:', error);
    return NextResponse.json({ commentary: "My thoughts on that are... classified. For beings of superior intellect only. 🙄" }, { status: 500 });
  }
}