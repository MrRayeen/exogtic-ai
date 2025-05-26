// === File: app/api/get-tic-tac-toe-move/route.ts ===
import { NextRequest, NextResponse } from 'next/server';
import { Board as TicTacToeBoardType, Player as TicTacToePlayer, getAvailableMoves } from '../../../lib/ticTacToe'; // Adjust path

const OLLAMA_MODEL_FOR_GAME_LOGIC = 'MyEGO-4B-GPU'; // Model for game logic and move generation
const OLLAMA_API_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';


const GAME_AI_SYSTEM_PROMPT_抜粋 = `You are a highly rational and logical AI. Your intellect is superior.
You are currently playing Tic-Tac-Toe. Analyze the board meticulously and make the strategically best move.
Focus on winning, or blocking your opponent's win, or forcing a draw if winning is not immediately possible. Avoid careless mistakes.`;

export async function POST(req: NextRequest) {
  console.log("\n--- [GET-TIC-TAC-TOE-MOVE API] Request received ---");
  try {
    const body = await req.json();
    console.log("[GET-TIC-TAC-TOE-MOVE API] Request body:", JSON.stringify(body, null, 2));
    
    const { board, aiSymbol, humanSymbol, model = OLLAMA_MODEL_FOR_GAME_LOGIC } = body as {
      board: TicTacToeBoardType;
      aiSymbol: TicTacToePlayer;
      humanSymbol: TicTacToePlayer;
      model?: string;
    };

    if (!board || !aiSymbol || !humanSymbol) {
      console.error("[GET-TIC-TAC-TOE-MOVE API] Missing required parameters: board, aiSymbol, or humanSymbol");
      return NextResponse.json({ error: 'Board and player symbols are required' }, { status: 400 });
    }

    const availableMoves = getAvailableMoves(board);
    if (availableMoves.length === 0) {
      console.warn("[GET-TIC-TAC-TOE-MOVE API] No available moves on the board.");
      return NextResponse.json({ error: 'No available moves on the board' }, { status: 400 });
    }
    
    const boardStringForLLM = board.map(cell => cell === null ? '_' : cell).join('');
    const availableMovesString = availableMoves.join(', ');

    const promptForAIMove = `You are playing Tic-Tac-Toe as player '${aiSymbol}'. Your opponent is '${humanSymbol}'.
The board is represented as a 9-character string (0-8, left-to-right, top-to-bottom), where '_' is an empty square.
Current board: "${boardStringForLLM}"
Available empty squares (0-indexed) for your move are: [${availableMovesString}]
Your task is to choose your next move. Using your superior intellect and logical reasoning, select the best possible square index from ALL the available moves. Consider all options before deciding.
Respond ONLY with the single digit number (0-8) of your chosen square. Do not include any other text, explanations, or commentary. Just the number.
For example, if square 5 is available and you choose it, respond with: 5`;

    const ollamaPayload = { model, prompt: promptForAIMove, system: GAME_AI_SYSTEM_PROMPT_抜粋, stream: false, options: { temperature: 0.45, top_p: 0.8, num_predict: 5 } };
    console.log("[GET-TIC-TAC-TOE-MOVE API] Sending to Ollama:", JSON.stringify(ollamaPayload, null, 2));
    console.log(`[GET-TIC-TAC-TOE-MOVE API] Ollama URL: ${OLLAMA_API_BASE_URL}/api/generate`);


    const ollamaResponse = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ollamaPayload),
    });

    console.log(`[GET-TIC-TAC-TOE-MOVE API] Ollama response status: ${ollamaResponse.status}`);
    const responseText = await ollamaResponse.text(); // Get text first for logging
    console.log("[GET-TIC-TAC-TOE-MOVE API] Raw Ollama response text:", responseText);

    if (!ollamaResponse.ok) {
      console.error('[GET-TIC-TAC-TOE-MOVE API] Ollama API error. Status:', ollamaResponse.status, 'Body:', responseText);
      const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      return NextResponse.json({ move: randomMove, strategy: "fallback_random_ollama_error", raw_response: `Ollama Error: ${responseText}` });
    }

    const ollamaJson = JSON.parse(responseText); // Parse text to JSON
    const rawResponse = ollamaJson.response?.trim() || "";
    console.log("[GET-TIC-TAC-TOE-MOVE API] Parsed Ollama 'response' field:", rawResponse);

    const moveMatch = rawResponse.match(/^\d$/);
    let chosenMove: number | null = null;

    if (moveMatch && moveMatch[0]) {
      const parsedMove = parseInt(moveMatch[0], 10);
      if (availableMoves.includes(parsedMove)) {
        chosenMove = parsedMove;
        console.log(`[GET-TIC-TAC-TOE-MOVE API] LLM chose valid move: ${chosenMove}`);
      } else {
        console.warn(`[GET-TIC-TAC-TOE-MOVE API] LLM proposed an invalid or unavailable move: ${parsedMove}. Available: [${availableMovesString}]. Raw: "${rawResponse}"`);
      }
    } else {
      console.warn(`[GET-TIC-TAC-TOE-MOVE API] LLM response for move was not a single digit number: "${rawResponse}"`);
    }

    if (chosenMove === null) {
      console.warn("[GET-TIC-TAC-TOE-MOVE API] Falling back to random move for AI.");
      chosenMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      return NextResponse.json({ move: chosenMove, strategy: "fallback_random_parsing_error", raw_response: rawResponse });
    }
    
    console.log("[GET-TIC-TAC-TOE-MOVE API] Successfully returning move:", chosenMove);
    return NextResponse.json({ move: chosenMove, strategy: "llm_generated", raw_response: rawResponse });

  } catch (error: any) {
    console.error('[GET-TIC-TAC-TOE-MOVE API] Fatal error in API route:', error.message, error.stack);
    // Attempt to provide a fallback even in fatal error, though 'board' isn't directly available from req in catch.
    // This part might need to be simplified or just return a generic error.
    const fallbackMove = Math.floor(Math.random() * 9); // Very basic fallback if board unknown
    return NextResponse.json( { move: fallbackMove, strategy: "fallback_exception", error_details: error.message }, { status: 500 });
  }
}