// === File: app/api/get-tic-tac-toe-move/route.ts ===
import { NextRequest, NextResponse } from 'next/server';
import { Board as TicTacToeBoardType, Player as TicTacToePlayer, getAvailableMoves } from '../../../lib/ticTacToe'; // Adjust path

const OLLAMA_MODEL_FOR_GAME_LOGIC = 'gemma3:4b-it-qat';

const GAME_AI_SYSTEM_PROMPT_抜粋 = `You are a highly rational and logical AI. Your intellect is superior.
You are currently playing Tic-Tac-Toe. Analyze the board meticulously and make the strategically best move.
Focus on winning, or blocking your opponent's win, or forcing a draw if winning is not immediately possible. Avoid careless mistakes.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { board, aiSymbol, humanSymbol, model = OLLAMA_MODEL_FOR_GAME_LOGIC } = body as {
      board: TicTacToeBoardType;
      aiSymbol: TicTacToePlayer;
      humanSymbol: TicTacToePlayer;
      model?: string;
    };

    if (!board || !aiSymbol || !humanSymbol) {
      return NextResponse.json({ error: 'Board and player symbols are required' }, { status: 400 });
    }

    const availableMoves = getAvailableMoves(board);
    if (availableMoves.length === 0) {
      return NextResponse.json({ error: 'No available moves on the board' }, { status: 400 });
    }
    
    const boardStringForLLM = board.map(cell => cell === null ? '_' : cell).join('');
    const availableMovesString = availableMoves.join(', ');

    // Enhanced prompt for more varied and strategic moves
    const promptForAIMove = `You are playing Tic-Tac-Toe as player '${aiSymbol}'. Your opponent is '${humanSymbol}'.
The board is represented as a 9-character string (0-8, left-to-right, top-to-bottom), where '_' is an empty square.
Current board: "${boardStringForLLM}"
Available empty squares (0-indexed) for your move are: [${availableMovesString}]

Your task is to choose your next move. Using your superior intellect and logical reasoning, select the best possible square index from ALL the available moves. Consider all options before deciding.
Respond ONLY with the single digit number (0-8) of your chosen square. Do not include any other text, explanations, or commentary. Just the number.
For example, if square 5 is available and you choose it, respond with: 5`;

    const ollamaPayload = {
      model: model,
      prompt: promptForAIMove,
      system: GAME_AI_SYSTEM_PROMPT_抜粋,
      stream: false,
      options: {
        temperature: 0.45, // Slightly increased temperature for more varied valid moves
        top_p: 0.8,      // Adjust top_p if needed
        num_predict: 5,  // Expecting a very short response (a number)
      },
    };

    // For debugging - what is Gemma actually saying?
    // console.log("Sending to Ollama for AI move:", JSON.stringify(ollamaPayload, null, 2));

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaPayload),
    });

    if (!ollamaResponse.ok) {
      const errorBody = await ollamaResponse.text();
      console.error('Ollama API error during AI move generation:', errorBody);
      const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      return NextResponse.json({ move: randomMove, strategy: "fallback_random_ollama_error", raw_response: `Ollama Error: ${errorBody}` });
    }

    const ollamaJson = await ollamaResponse.json();
    const rawResponse = ollamaJson.response?.trim() || "";
    // console.log("Raw response from Ollama for AI move:", rawResponse); // Log for debugging

    const moveMatch = rawResponse.match(/^\d$/); // Match only a single digit string
    let chosenMove: number | null = null;

    if (moveMatch && moveMatch[0]) {
      const parsedMove = parseInt(moveMatch[0], 10);
      if (availableMoves.includes(parsedMove)) {
        chosenMove = parsedMove;
      } else {
        console.warn(`LLM proposed an invalid or unavailable move: ${parsedMove}. Available: [${availableMovesString}]. Raw: "${rawResponse}"`);
      }
    } else {
      console.warn(`LLM response for move was not a single digit number: "${rawResponse}"`);
    }

    if (chosenMove === null) {
      console.warn("Falling back to random move for AI.");
      chosenMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      return NextResponse.json({ move: chosenMove, strategy: "fallback_random_parsing_error", raw_response: rawResponse });
    }
    
    return NextResponse.json({ move: chosenMove, strategy: "llm_generated", raw_response: rawResponse });

  } catch (error: any) {
    console.error('API Route /api/get-tic-tac-toe-move Error:', error);
    // Fallback in case of any unexpected error - crucial for game flow
    const available = getAvailableMoves(JSON.parse(req.nextUrl.searchParams.get('board') || '[]')); // Attempt to get board for fallback
    const randomMove = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : 0; // Default to 0 if board parse fails
    return NextResponse.json( { move: randomMove, strategy: "fallback_exception", error_details: error.message }, { status: 500 });
  }
}