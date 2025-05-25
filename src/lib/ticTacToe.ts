// === File: lib/ticTacToe.ts ===
// (Create a 'lib' folder in your 'src' or root directory and place this file there)

// --- 1. Define Types ---
export type Player = 'X' | 'O';
export type SquareValue = Player | null;
export type Board = SquareValue[]; // Array of 9 squares

export const HUMAN_PLAYER: Player = 'X'; // Default human player
export const AI_PLAYER: Player = 'O';    // Default AI player

// Winning combinations (indices of the board array)
const WINNING_COMBINATIONS = [
  [0, 1, 2], // Top row
  [3, 4, 5], // Middle row
  [6, 7, 8], // Bottom row
  [0, 3, 6], // Left column
  [1, 4, 7], // Middle column
  [2, 5, 8], // Right column
  [0, 4, 8], // Diagonal from top-left
  [2, 4, 6], // Diagonal from top-right
];

// --- 2. Core Game Functions ---

/**
 * Creates and returns a new empty Tic-Tac-Toe board.
 * @returns {Board} An array of 9 null values.
 */
export function createEmptyBoard(): Board {
  return Array(9).fill(null);
}

/**
 * Checks if a given player has won on the current board.
 * @param {Board} board - The current state of the board.
 * @param {Player} player - The player to check for a win ('X' or 'O').
 * @returns {boolean} True if the player has won, false otherwise.
 */
export function checkWinner(board: Board, player: Player): boolean {
  for (const combination of WINNING_COMBINATIONS) {
    const [a, b, c] = combination;
    if (board[a] === player && board[b] === player && board[c] === player) {
      return true; // Player has a winning combination
    }
  }
  return false; // No winning combination found for the player
}

/**
 * Checks if the board is completely full (resulting in a draw if no winner).
 * @param {Board} board - The current state of the board.
 * @returns {boolean} True if the board is full, false otherwise.
 */
export function isBoardFull(board: Board): boolean {
  return board.every(square => square !== null); // Checks if every square is not null
}

/**
 * Gets a list of indices representing available (empty) moves on the board.
 * @param {Board} board - The current state of the board.
 * @returns {number[]} An array of indices of empty squares.
 */
export function getAvailableMoves(board: Board): number[] {
  const moves: number[] = [];
  board.forEach((square, index) => {
    if (square === null) {
      moves.push(index);
    }
  });
  return moves;
}

/**
 * Makes a move for the given player at the specified index if the square is empty.
 * @param {Board} board - The current state of the board.
 * @param {number} index - The index (0-8) where the player wants to move.
 * @param {Player} player - The player making the move ('X' or 'O').
 * @returns {Board | null} The new board state if the move is valid, or null if the move is invalid.
 */
export function makeMove(board: Board, index: number, player: Player): Board | null {
  if (index < 0 || index > 8 || board[index] !== null) {
    return null; // Invalid move (out of bounds or square already taken)
  }
  const newBoard = [...board]; // Create a copy of the board to maintain immutability
  newBoard[index] = player;
  return newBoard;
}

// --- 3. AI Move Logic (Simple Random for now) ---

/**
 * Gets a random available move for the AI.
 * This is a very basic AI strategy.
 * @param {Board} board - The current state of the board.
 * @returns {number | null} The index of the chosen move, or null if no moves are available.
 */
export function getRandomAIMove(board: Board): number | null {
  const availableMoves = getAvailableMoves(board);
  if (availableMoves.length === 0) {
    return null; // No moves left
  }
  const randomIndex = Math.floor(Math.random() * availableMoves.length);
  return availableMoves[randomIndex];
}

/**
 * Minimax algorithm for Tic-Tac-Toe AI (Optimal play).
 * We can implement this later to make the AI smarter.
 * For now, we'll use getRandomAIMove.
 *
 * @param {Board} board - The current board state.
 * @param {Player} aiPlayerSymbol - The AI's symbol ('X' or 'O').
 * @param {Player} humanPlayerSymbol - The Human's symbol.
 * @returns {number} The index of the best move for the AI.
 */
export function getBestAIMove(board: Board, aiPlayerSymbol: Player, humanPlayerSymbol: Player): number {
    // Placeholder - for now, just return a random move.
    // We will replace this with the Minimax algorithm later.
    const randomMove = getRandomAIMove(board);
    if (randomMove !== null) {
        return randomMove;
    }
    // Should not happen if game isn't over, but as a fallback:
    return getAvailableMoves(board)[0] ?? -1; // Fallback if somehow no random move found
}


// --- Helper to print board to console for debugging (optional) ---
export function printBoard(board: Board): void {
  console.log("\n");
  console.log(` ${board[0] || ' '} | ${board[1] || ' '} | ${board[2] || ' '} `);
  console.log("---|---|---");
  console.log(` ${board[3] || ' '} | ${board[4] || ' '} | ${board[5] || ' '} `);
  console.log("---|---|---");
  console.log(` ${board[6] || ' '} | ${board[7] || ' '} | ${board[8] || ' '} `);
  console.log("\n");
}