// === File: app/page.tsx ===
"use client";

import { useState, useEffect, FormEvent, useRef } from "react";
import { v4 as uuidv4 } from "uuid"; // Ensure uuid is installed: npm install uuid @types/uuid
import {
  Board as TicTacToeBoardType,
  Player as TicTacToePlayer,
  SquareValue as TicTacToeSquareValue,
  createEmptyBoard,
  checkWinner,
  isBoardFull,
  makeMove,
  getAvailableMoves,
  // HUMAN_PLAYER as DEFAULT_HUMAN_PLAYER, AI_PLAYER as DEFAULT_AI_PLAYER // Constants can be defined in-component if preferred
} from "../lib/ticTacToe"; // Make sure this path is correct (e.g., src/lib/ticTacToe)

// --- 1. Define Data Structures & Constants ---
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  isGameMessage?: boolean;
  messageType?:
    | "user_action"
    | "ai_thinking"
    | "ai_commentary"
    | "game_status"
    | "system_info";
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  lastModifiedAt: string;
  titleGenerated?: boolean;
}

const OLLAMA_MODEL_NAME = "gemma3:4b-it-qat"; // User-specified model name

// Tic-Tac-Toe Specific Types
type GameStatus =
  | "setup"
  | "choosing_symbol"
  | "choosing_first_player"
  | "playing"
  | "human_won"
  | "ai_won"
  | "draw"
  | "ended";

interface TicTacToeGameState {
  board: TicTacToeBoardType;
  humanSymbol: TicTacToePlayer | null;
  aiSymbol: TicTacToePlayer | null;
  currentPlayer: TicTacToePlayer | null;
  status: GameStatus;
  winner: TicTacToePlayer | "draw" | null;
  isHumanFirst: boolean | null;
}

export default function ChatPage() {
  // --- 2. State Variables ---
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false); // For main chat AI response
  const [isTitling, setIsTitling] = useState<{ [chatId: string]: boolean }>({}); // For AI title generation
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true); // Sidebar visibility

  // Tic-Tac-Toe Game State
  const [ticTacToeState, setTicTacToeState] =
    useState<TicTacToeGameState | null>(null);
  const [isAiThinkingMove, setIsAiThinkingMove] = useState<boolean>(false); // For TTT AI move
  const [isFetchingCommentary, setIsFetchingCommentary] =
    useState<boolean>(false); // For TTT AI commentary

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- 3. useEffect Hooks ---
  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedSessions = localStorage.getItem("chatSessions");
      if (storedSessions) {
        const parsedSessions: ChatSession[] = JSON.parse(storedSessions).map(
          (s: any) => ({ ...s, titleGenerated: s.titleGenerated || false })
        );
        setChatSessions(parsedSessions);
        const storedActiveId = localStorage.getItem("activeChatId");
        if (
          storedActiveId &&
          parsedSessions.some((s) => s.id === storedActiveId)
        ) {
          setActiveChatId(storedActiveId);
        } else if (parsedSessions.length > 0) {
          const sortedSessions = [...parsedSessions].sort(
            (a, b) =>
              new Date(b.lastModifiedAt).getTime() -
              new Date(a.lastModifiedAt).getTime()
          );
          setActiveChatId(sortedSessions[0].id);
        } else {
          handleNewChat(true); // Create one if none exist
        }
      } else {
        handleNewChat(true); // Create one if nothing in storage
      }
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      localStorage.removeItem("chatSessions");
      localStorage.removeItem("activeChatId");
      handleNewChat(true);
    }
    if (typeof window !== "undefined") {
      setIsSidebarOpen(window.innerWidth >= 768); // 'md' breakpoint
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (chatSessions.length > 0 || localStorage.getItem("chatSessions")) {
      // Save even if it becomes empty, to clear it
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    }
  }, [chatSessions]);

  // Save activeChatId to localStorage
  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem("activeChatId", activeChatId);
    } else if (chatSessions.length === 0) {
      // Clear if no chats left
      localStorage.removeItem("activeChatId");
    }
  }, [activeChatId, chatSessions.length]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatSessions, activeChatId]); // Also trigger on activeChatId change

  // Focus input
  useEffect(() => {
    if (activeChatId && inputRef.current && !ticTacToeState) {
      // Don't refocus if game is active and input might be disabled
      inputRef.current.focus();
    }
  }, [activeChatId, ticTacToeState]);

  // --- 4. Core Functions ---
  const addMessageToActiveChat = (message: Message) => {
    if (!activeChatId) return;
    setChatSessions((prevSessions) =>
      prevSessions.map((session) =>
        session.id === activeChatId
          ? {
              ...session,
              messages: [...session.messages, message],
              lastModifiedAt: new Date().toISOString(),
            }
          : session
      )
    );
  };

  const addSystemMessage = (
    content: string,
    type: Message["messageType"] = "system_info"
  ) => {
    addMessageToActiveChat({
      id: uuidv4(),
      role: "assistant",
      content,
      isGameMessage: true,
      messageType: type,
    });
  };

  const handleNewChat = (setActive = true) => {
    const newChatId = uuidv4();
    const now = new Date().toISOString();
    const newChat: ChatSession = {
      id: newChatId,
      title: `New Chat ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      messages: [],
      createdAt: now,
      lastModifiedAt: now,
      titleGenerated: false,
    };
    setChatSessions((prevSessions) => [newChat, ...prevSessions]);
    if (setActive) setActiveChatId(newChatId);
    if (inputRef.current) inputRef.current.focus();
    setTicTacToeState(null); // Ensure game mode is exited
    return newChatId;
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setTicTacToeState(null); // Exit game mode when switching chats
    if (inputRef.current) inputRef.current.focus();
    if (typeof window !== "undefined" && window.innerWidth < 768)
      setIsSidebarOpen(false);
  };

  const handleDeleteChat = (chatIdToDelete: string) => {
    const sessionToDelete = chatSessions.find((s) => s.id === chatIdToDelete);
    if (!sessionToDelete) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${sessionToDelete.title}"?`
    );
    if (!confirmDelete) return;

    setChatSessions((prevSessions) =>
      prevSessions.filter((session) => session.id !== chatIdToDelete)
    );
    if (activeChatId === chatIdToDelete) {
      const remainingSessions = chatSessions.filter(
        (session) => session.id !== chatIdToDelete
      );
      if (remainingSessions.length > 0) {
        setActiveChatId(
          remainingSessions.sort(
            (a, b) =>
              new Date(b.lastModifiedAt).getTime() -
              new Date(a.lastModifiedAt).getTime()
          )[0].id
        );
      } else {
        setActiveChatId(null); // No chats left
        handleNewChat(); // Create a new one
      }
    }
  };

  const generateAndSetChatTitle = async (
    chatId: string,
    messagesForTitle: Message[]
  ) => {
    /* ... (as provided before) ... */
  };

  // --- Tic-Tac-Toe Specific Functions ---
  const fetchGameCommentary = async (
    eventType:
      | "human_move"
      | "ai_move"
      | "human_wins"
      | "ai_wins"
      | "draw_game",
    board: TicTacToeBoardType,
    currentAiSymbol: TicTacToePlayer,
    currentHumanSymbol: TicTacToePlayer,
    playerSymbol?: TicTacToePlayer,
    moveIndex?: number
  ) => {
    setIsFetchingCommentary(true);
    try {
      const response = await fetch("/api/get-game-commentary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board,
          eventType,
          playerSymbol,
          moveIndex,
          aiSymbol: currentAiSymbol,
          humanSymbol: currentHumanSymbol,
          model: OLLAMA_MODEL_NAME,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        addSystemMessage(data.commentary || "...", "ai_commentary");
      } else {
        addSystemMessage(
          "My thoughts are currently... processing. 😒 (Comment API error)",
          "ai_commentary"
        );
      }
    } catch (error) {
      addSystemMessage(
        "An error prevented my brilliant commentary. How typical. 🙄",
        "ai_commentary"
      );
    } finally {
      setIsFetchingCommentary(false);
    }
  };

  const initiateTicTacToe = () => {
    if (!activeChatId) {
      // Ensure there's an active chat or create one
      const newId = handleNewChat(true);
      if (!newId) return; // Should not happen
      // Brief delay to allow state to update before setting title
      setTimeout(() => {
        setChatSessions((prevSessions) =>
          prevSessions.map((session) =>
            session.id === newId
              ? {
                  ...session,
                  title: "Tic-Tac-Toe Challenge 💥",
                  titleGenerated: true,
                  lastModifiedAt: new Date().toISOString(),
                }
              : session
          )
        );
      }, 0);
    } else {
      setChatSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === activeChatId
            ? {
                ...session,
                title: "Tic-Tac-Toe Challenge 💥",
                titleGenerated: true,
                lastModifiedAt: new Date().toISOString(),
              }
            : session
        )
      );
    }
    addSystemMessage(
      "Ah, Tic-Tac-Toe? A trivial pursuit for an intellect like mine, but I shall indulge you. 🥱 Let's set the terms of your inevitable defeat.",
      "system_info"
    );
    setTicTacToeState({
      board: createEmptyBoard(),
      humanSymbol: null,
      aiSymbol: null,
      currentPlayer: null,
      status: "choosing_symbol",
      winner: null,
      isHumanFirst: null,
    });
    setIsSidebarOpen(false);
  };

  const handleSymbolChoice = (symbol: TicTacToePlayer) => {
    if (ticTacToeState?.status !== "choosing_symbol") return;
    const aiS = symbol === "X" ? "O" : "X";
    setTicTacToeState((prev) =>
      prev
        ? {
            ...prev,
            humanSymbol: symbol,
            aiSymbol: aiS,
            status: "choosing_first_player",
          }
        : null
    );
    addSystemMessage(
      `You've chosen ${symbol}. A bold, if predictable, choice. I, with my superior intellect, shall play as ${aiS}.`,
      "system_info"
    );
  };

  const handleFirstPlayerChoice = (humanGoesFirst: boolean) => {
    if (
      ticTacToeState?.status !== "choosing_first_player" ||
      !ticTacToeState.humanSymbol ||
      !ticTacToeState.aiSymbol
    )
      return;
    const firstPlayer = humanGoesFirst
      ? ticTacToeState.humanSymbol
      : ticTacToeState.aiSymbol;
    const nextState: TicTacToeGameState = {
      ...ticTacToeState,
      isHumanFirst: humanGoesFirst,
      currentPlayer: firstPlayer,
      status: "playing",
    };
    setTicTacToeState(nextState);
    addSystemMessage(
      humanGoesFirst
        ? "You may make the first move. Don't keep me waiting. 😑"
        : "As expected, you defer to superior processing. I shall initiate. 🤔",
      "system_info"
    );
    if (!humanGoesFirst) {
      setTimeout(() => aiMakeMove(nextState), 500);
    }
  };

  const handleSquareClick = async (index: number) => {
    if (
      !ticTacToeState ||
      ticTacToeState.status !== "playing" ||
      ticTacToeState.currentPlayer !== ticTacToeState.humanSymbol ||
      ticTacToeState.board[index] !== null ||
      !ticTacToeState.humanSymbol ||
      !ticTacToeState.aiSymbol
    ) {
      return;
    }
    const newBoard = makeMove(
      ticTacToeState.board,
      index,
      ticTacToeState.humanSymbol
    );
    if (newBoard) {
      addMessageToActiveChat({
        id: uuidv4(),
        role: "user",
        content: `Played ${ticTacToeState.humanSymbol} at square ${index + 1}.`,
        isGameMessage: true,
        messageType: "user_action",
      });

      let newStatus: GameStatus = "playing";
      let newWinner: TicTacToePlayer | "draw" | null = null;
      if (checkWinner(newBoard, ticTacToeState.humanSymbol)) {
        newStatus = "human_won";
        newWinner = ticTacToeState.humanSymbol;
      } else if (isBoardFull(newBoard)) {
        newStatus = "draw";
        newWinner = "draw";
      }

      const updatedState: TicTacToeGameState = {
        ...ticTacToeState,
        board: newBoard,
        currentPlayer: newStatus === "playing" ? ticTacToeState.aiSymbol : null,
        status: newStatus,
        winner: newWinner,
      };
      setTicTacToeState(updatedState);

      if (newStatus === "human_won") {
        await fetchGameCommentary(
          "human_wins",
          newBoard,
          ticTacToeState.aiSymbol,
          ticTacToeState.humanSymbol,
          ticTacToeState.humanSymbol
        );
      } else if (newStatus === "draw") {
        await fetchGameCommentary(
          "draw_game",
          newBoard,
          ticTacToeState.aiSymbol,
          ticTacToeState.humanSymbol
        );
      } else {
        await fetchGameCommentary(
          "human_move",
          newBoard,
          ticTacToeState.aiSymbol,
          ticTacToeState.humanSymbol,
          ticTacToeState.humanSymbol,
          index
        );
        if (updatedState.currentPlayer === ticTacToeState.aiSymbol) {
          setTimeout(() => aiMakeMove(updatedState), 500);
        }
      }
    }
  };

  const aiMakeMove = async (currentState: TicTacToeGameState) => {
    // currentState is now guaranteed by call site
    if (
      currentState.status !== "playing" ||
      currentState.currentPlayer !== currentState.aiSymbol ||
      !currentState.aiSymbol ||
      !currentState.humanSymbol
    )
      return;
    setIsAiThinkingMove(true);
    addSystemMessage(
      `My turn. Analyzing board with superior logic... ${currentState.aiSymbol} contemplating... 🤔`,
      "ai_thinking"
    );
    let aiMoveIndex: number | null = null;

    try {
      const response = await fetch("/api/get-tic-tac-toe-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board: currentState.board,
          aiSymbol: currentState.aiSymbol,
          humanSymbol: currentState.humanSymbol,
          model: OLLAMA_MODEL_NAME,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (
          typeof data.move === "number" &&
          currentState.board[data.move] === null
        )
          aiMoveIndex = data.move;
        else {
          if (typeof data.move === "number")
            console.warn(`AI proposed occupied square ${data.move}`);
          else console.warn("AI move API invalid data:", data);
        }
      } else {
        console.error("AI Move API error:", await response.text());
      }
      if (aiMoveIndex === null) {
        // Fallback
        addSystemMessage(
          `(My advanced calculations are... on a break. Random move it is!)`,
          "system_info"
        );
        const available = getAvailableMoves(currentState.board);
        if (available.length > 0)
          aiMoveIndex = available[Math.floor(Math.random() * available.length)];
      }
      if (aiMoveIndex !== null) {
        const newBoard = makeMove(
          currentState.board,
          aiMoveIndex,
          currentState.aiSymbol
        );
        if (newBoard) {
          let newStatus: GameStatus = "playing";
          let newWinner: TicTacToePlayer | "draw" | null = null;
          if (checkWinner(newBoard, currentState.aiSymbol)) {
            newStatus = "ai_won";
            newWinner = currentState.aiSymbol;
          } else if (isBoardFull(newBoard)) {
            newStatus = "draw";
            newWinner = "draw";
          }
          const nextGameState = {
            ...currentState,
            board: newBoard,
            currentPlayer:
              newStatus === "playing" ? currentState.humanSymbol : null,
            status: newStatus,
            winner: newWinner,
          };
          setTicTacToeState(nextGameState);
          if (newStatus === "ai_won") {
            await fetchGameCommentary(
              "ai_wins",
              newBoard,
              currentState.aiSymbol,
              currentState.humanSymbol,
              currentState.aiSymbol
            );
          } else if (newStatus === "draw") {
            await fetchGameCommentary(
              "draw_game",
              newBoard,
              currentState.aiSymbol,
              currentState.humanSymbol
            );
          } else {
            await fetchGameCommentary(
              "ai_move",
              newBoard,
              currentState.aiSymbol,
              currentState.humanSymbol,
              currentState.aiSymbol,
              aiMoveIndex
            );
          }
        }
      } else {
        addSystemMessage(
          "Hmm, no valid moves for me? A flaw in the universe, surely. 😒",
          "system_info"
        );
      }
    } catch (error) {
      console.error("Error during AI move processing:", error);
      addSystemMessage(
        "An unexpected error in my processing. How droll. 😒",
        "system_info"
      );
    } finally {
      setIsAiThinkingMove(false);
    }
  };

  const resetTicTacToe = () => {
    addSystemMessage(
      "Another attempt? Very well. Resetting... 🧐",
      "system_info"
    );
    initiateTicTacToe();
  };
  const exitTicTacToe = () => {
    addSystemMessage(
      "Fleeing? Predictable. Resuming normal operations. 😒",
      "system_info"
    );
    setTicTacToeState(null);
    if (typeof window !== "undefined" && window.innerWidth >= 768)
      setIsSidebarOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || !activeChatId || isLoading) return;

    if (trimmedInput.toLowerCase() === "/play tic-tac-toe") {
      initiateTicTacToe();
      setInput("");
      return;
    }
    if (ticTacToeState && ticTacToeState.status !== "ended") {
      // Allow commentary during game
      addMessageToActiveChat({
        id: uuidv4(),
        role: "user",
        content: trimmedInput,
        isGameMessage: true,
        messageType: "user_action",
      });
      // Optionally, get an AI comment on the user's chat message during the game
      // For now, just logs it. AI will respond with game moves or its own commentary.
      setInput("");
      return;
    }

    // Regular chat logic
    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: trimmedInput,
    };
    let sessionForTitlingCheck: ChatSession | undefined;
    setChatSessions((prevSessions) => {
      const updatedSessions = prevSessions.map((session) => {
        if (session.id === activeChatId) {
          const updatedSession = {
            ...session,
            messages: [...session.messages, userMessage],
            lastModifiedAt: new Date().toISOString(),
          };
          sessionForTitlingCheck = updatedSession;
          return updatedSession;
        }
        return session;
      });
      return updatedSessions;
    });
    setInput("");
    setIsLoading(true);
    let finalAssistantResponseContent = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedInput,
          model: OLLAMA_MODEL_NAME,
        }),
      });
      if (!response.ok || !response.body) {
        const errTxt = await response.text();
        throw new Error(`API err: ${response.statusText}. ${errTxt}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponseAccumulator = "";
      const assistantMessageId = uuidv4();
      addMessageToActiveChat({
        id: assistantMessageId,
        role: "assistant",
        content: "",
      }); // Placeholder
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf("\n");
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);
          if (line) {
            try {
              const parsedChunk = JSON.parse(line);
              if (parsedChunk.response) {
                assistantResponseAccumulator += parsedChunk.response;
                finalAssistantResponseContent = assistantResponseAccumulator;
                setChatSessions((prev) =>
                  prev.map((s) =>
                    s.id === activeChatId
                      ? {
                          ...s,
                          messages: s.messages.map((msg) =>
                            msg.id === assistantMessageId
                              ? {
                                  ...msg,
                                  content: assistantResponseAccumulator,
                                }
                              : msg
                          ),
                          lastModifiedAt: new Date().toISOString(),
                        }
                      : s
                  )
                );
              }
            } catch (error) {}
          }
          boundary = buffer.indexOf("\n");
        }
      }
    } catch (error) {
      console.error("Chat submit error:", error);
      const errMsg = `😥 Oops! Smth went wrong: ${
        error instanceof Error ? error.message : String(error)
      }`;
      finalAssistantResponseContent = errMsg;
      addMessageToActiveChat({
        id: uuidv4(),
        role: "assistant",
        content: errMsg,
      });
    } finally {
      setIsLoading(false);
      if (inputRef.current) inputRef.current.focus();
      if (sessionForTitlingCheck && activeChatId && !ticTacToeState) {
        const currentChat = chatSessions.find((s) => s.id === activeChatId);
        if (
          currentChat &&
          !currentChat.titleGenerated &&
          currentChat.title.startsWith("New Chat ")
        ) {
          const userMessagesInChat = currentChat.messages.filter(
            (m) => m.role === "user"
          );
          if (userMessagesInChat.length === 2) {
            generateAndSetChatTitle(activeChatId, currentChat.messages);
          }
        }
      }
    }
  };

  const activeChat = chatSessions.find(
    (session) => session.id === activeChatId
  );
  const currentMessages = activeChat ? activeChat.messages : [];
  const sortedChatSessions = [...chatSessions].sort(
    (a, b) =>
      new Date(b.lastModifiedAt).getTime() -
      new Date(a.lastModifiedAt).getTime()
  );

  // --- Tic-Tac-Toe Game UI Component ---
  const TicTacToeGameUI = () => {
    if (!ticTacToeState) return null;

    const neonColorX = "text-cyan-400"; // Neon Blue/Cyan for X
    const neonColorO = "text-pink-500"; // Neon Pink for O
    const neonGridColor = "border-purple-500/50";
    const neonCellHoverBg = "hover:bg-purple-500/20";

    const getSymbolStyle = (symbol: TicTacToeSquareValue) => {
      if (symbol === "X")
        return `${neonColorX} drop-shadow-[0_0_5px_rgba(0,255,255,0.7)]`;
      if (symbol === "O")
        return `${neonColorO} drop-shadow-[0_0_5px_rgba(255,0,255,0.7)]`;
      return "";
    };

    if (ticTacToeState.status === "choosing_symbol") {
      return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
          <p className="text-lg text-slate-300">
            Choose your implement of defeat (X or O):
          </p>
          <div className="flex space-x-4">
            <button
              onClick={() => handleSymbolChoice("X")}
              className={`px-6 py-3 rounded-lg font-bold text-3xl ${neonColorX} bg-gray-800 hover:bg-gray-700 shadow-md hover:shadow-cyan-500/50 transition-all`}
            >
              X
            </button>
            <button
              onClick={() => handleSymbolChoice("O")}
              className={`px-6 py-3 rounded-lg font-bold text-3xl ${neonColorO} bg-gray-800 hover:bg-gray-700 shadow-md hover:shadow-pink-500/50 transition-all`}
            >
              O
            </button>
          </div>
        </div>
      );
    }

    if (ticTacToeState.status === "choosing_first_player") {
      return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
          <p className="text-lg text-slate-300">
            And who shall have the honor of the first futile attempt?
          </p>
          <div className="flex space-x-4">
            <button
              onClick={() => handleFirstPlayerChoice(true)}
              className="px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-all"
            >
              You First
            </button>
            <button
              onClick={() => handleFirstPlayerChoice(false)}
              className="px-6 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-all"
            >
              AI First (Wise)
            </button>
          </div>
        </div>
      );
    }

    if (
      ticTacToeState.status === "playing" ||
      ticTacToeState.status === "human_won" ||
      ticTacToeState.status === "ai_won" ||
      ticTacToeState.status === "draw"
    ) {
      return (
        <div className="flex flex-col items-center justify-center p-2 md:p-4">
          <div
            className={`grid grid-cols-3 gap-1 md:gap-2 bg-gray-900/30 p-1 md:p-2 rounded-md shadow-2xl ${neonGridColor} border-2`}
          >
            {ticTacToeState.board.map((value, index) => (
              <button
                key={index}
                onClick={() => handleSquareClick(index)}
                disabled={
                  value !== null ||
                  ticTacToeState.status !== "playing" ||
                  ticTacToeState.currentPlayer !== ticTacToeState.humanSymbol
                }
                className={`w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 flex items-center justify-center text-4xl md:text-5xl font-bold 
                                        bg-gray-800/50 rounded-sm transition-all duration-150 ease-in-out
                                        ${
                                          value === null &&
                                          ticTacToeState.status === "playing" &&
                                          ticTacToeState.currentPlayer ===
                                            ticTacToeState.humanSymbol
                                            ? `${neonCellHoverBg} cursor-pointer`
                                            : "cursor-not-allowed"
                                        }
                                        ${getSymbolStyle(value)}
                                        /* Neon cell borders (subtle) */
                                        border border-purple-600/30 hover:border-purple-500/70`}
                aria-label={`Square ${index + 1}${
                  value ? `, marked ${value}` : ", empty"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          {(ticTacToeState.status === "human_won" ||
            ticTacToeState.status === "ai_won" ||
            ticTacToeState.status === "draw") && (
            <div className="mt-4 text-center">
              <p
                className={`text-xl font-bold ${
                  ticTacToeState.winner === ticTacToeState.humanSymbol
                    ? neonColorX
                    : ticTacToeState.winner === ticTacToeState.aiSymbol
                    ? neonColorO
                    : "text-slate-300"
                }`}
              >
                {ticTacToeState.status === "human_won" &&
                  `${ticTacToeState.humanSymbol} wins! A statistical anomaly, no doubt.`}
                {ticTacToeState.status === "ai_won" &&
                  `${ticTacToeState.aiSymbol} wins! Utterly predictable. 🥱`}
                {ticTacToeState.status === "draw" &&
                  "It's a draw. A monument to mediocrity. 😑"}
              </p>
              <button
                onClick={resetTicTacToe}
                className="mt-3 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all"
              >
                Play Again?
              </button>
              <button
                onClick={exitTicTacToe}
                className="mt-3 ml-3 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-all"
              >
                Exit Game
              </button>
            </div>
          )}
          {ticTacToeState.status === "playing" &&
            ticTacToeState.currentPlayer && (
              <p className="mt-3 text-sm text-slate-400">
                Turn:{" "}
                <span
                  className={`font-bold ${getSymbolStyle(
                    ticTacToeState.currentPlayer
                  )}`}
                >
                  {ticTacToeState.currentPlayer}
                </span>
                {ticTacToeState.currentPlayer === ticTacToeState.humanSymbol
                  ? " (Your move, try not to disappoint. 😒)"
                  : " (My move, prepare for ingenuity. 🤔)"}
              </p>
            )}
        </div>
      );
    }
    return null; // Should not happen if status is managed correctly
  };
  // --- Main Return JSX ---
  return (
    <div className="flex h-screen text-slate-200 font-sans relative overflow-hidden">
      <div className="absolute inset-0 z-0 animated-gradient"></div>

      {!ticTacToeState && (
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="md:hidden fixed top-4 left-4 z-30 p-2 bg-gray-800/80 backdrop-blur-md rounded-md text-slate-200"
          aria-label="Toggle sidebar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
      )}

      {!ticTacToeState && (
        <div
          className={`relative z-20 flex flex-col bg-gray-900/60 backdrop-blur-lg border-r border-gray-700/50 transition-all duration-300 ease-in-out ${
            isSidebarOpen
              ? "w-80 sm:w-96 p-4 opacity-100 pointer-events-auto"
              : "w-0 p-0 opacity-0 pointer-events-none"
          } md:w-80 lg:w-96 md:p-4 md:opacity-100 md:pointer-events-auto`}
        >
          <>
            <button
              onClick={() => {
                handleNewChat();
                if (typeof window !== "undefined" && window.innerWidth < 768)
                  setIsSidebarOpen(false);
              }}
              className="w-full mb-4 p-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-white font-semibold text-sm shadow-md transition-all active:scale-95 hover:shadow-lg hover:shadow-purple-500/40 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center space-x-2"
            >
              {" "}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>{" "}
              <span>New Chat</span>{" "}
            </button>
            <div className="flex-grow overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {sortedChatSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => handleSelectChat(session.id)}
                  className={`group p-3 rounded-xl cursor-pointer transition-all duration-200 ease-in-out transform hover:scale-[1.02] ${
                    activeChatId === session.id
                      ? "bg-purple-700/80 ring-2 ring-purple-500/70 scale-[1.02] shadow-lg shadow-purple-500/30"
                      : "bg-gray-800/70 hover:bg-gray-750/90"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-sm font-medium truncate text-slate-100 group-hover:text-white ${
                        isTitling[session.id] ? "italic text-gray-400" : ""
                      }`}
                    >
                      {isTitling[session.id]
                        ? "Generating title..."
                        : session.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChat(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/30 text-red-400 hover:text-red-300"
                      aria-label="Delete chat"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12.56 0c.342.052.682.107 1.022.166m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 group-hover:text-gray-300 mt-1">
                    {new Date(session.lastModifiedAt).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </>
        </div>
      )}

      <div
        className={`relative z-10 flex-grow flex flex-col bg-gray-950/70 backdrop-blur-xl shadow-2xl ${
          !ticTacToeState ? "md:rounded-l-2xl border-l" : "w-full"
        } border-gray-700/50 overflow-hidden transition-all duration-300 ease-in-out`}
      >
        <header className="p-4 border-b border-gray-700/50 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 truncate">
            {ticTacToeState
              ? "Tic-Tac-Toe Challenge Neon Grid 💥"
              : "Exogtic AI 4B ✨"}
          </h1>
        </header>

        {ticTacToeState ? (
          // Game Mode Active: Mobile will be vertical (60% board, 40% chat/input), Desktop side-by-side
          <div className="flex-grow flex flex-col md:flex-row overflow-hidden"> {/* Parent for game mode */}
            
            {/* Game Board Area */}
            <div className="
              h-[60vh] md:h-full                              সাপmobile: 60% of viewport height. desktop: full height of row.
              w-full md:w-2/5 lg:w-1/3                        /* mobile: full width. desktop: proportional width */
              p-2 md:p-4 
              border-b md:border-b-0 md:border-r border-purple-500/30 
              flex items-center justify-center 
              bg-gray-950/40                                  /* Slightly adjusted bg for board area */
              custom-scrollbar overflow-y-auto                /* Scroll if board UI somehow overflows */
            ">
              <TicTacToeGameUI />
            </div>

            {/* Game Chat/Log Area */}
            <div className="
              h-[40vh] md:h-full                             /* mobile: 40% of viewport height. desktop: full height of row. */
              w-full md:w-3/5 lg:w-2/3                        /* mobile: full width. desktop: proportional width */
              flex flex-col                                   /* Children (chat list, form) will stack vertically */
              bg-gray-950/70                                  /* Keep consistent with main chat area bg */
            ">
              <div ref={chatContainerRef} className="flex-grow p-4 sm:p-6 space-y-4 overflow-y-auto smooth-scroll custom-scrollbar">
                {/* Filter to show relevant messages for the game */}
                {currentMessages.filter(msg => msg.isGameMessage === true || ticTacToeState).map((msg) => {
                    let bubbleBaseStyle = "max-w-[90%] sm:max-w-[80%] px-4 py-2.5 rounded-2xl shadow-lg";
                    let bubbleRoleStyle = "";
                    let messageContainerStyle = `flex animate-fadeInEnhanced my-1 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`;

                    if (msg.messageType === 'ai_thinking') {
                        bubbleRoleStyle = 'bg-transparent text-purple-300 italic shadow-none px-0';
                        messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-2 text-center w-full`;
                    } else if (msg.messageType === 'user_action') {
                        bubbleRoleStyle = 'bg-purple-600/90 text-white rounded-br-none opacity-90';
                    } else if (msg.messageType === 'system_info') {
                        bubbleRoleStyle = 'bg-gray-700/80 text-slate-300 italic shadow-none text-xs px-3 py-1';
                        messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-1 text-center w-full`;
                    } else if (msg.role === 'user') {
                        bubbleRoleStyle = 'bg-purple-600 text-white rounded-br-none';
                    } else { // Assistant's commentary or regular game messages
                        bubbleRoleStyle = 'bg-gray-800 text-slate-200 rounded-bl-none';
                    }
                    return (
                    <div key={msg.id} className={messageContainerStyle}>
                        <div className={`${bubbleBaseStyle} ${bubbleRoleStyle}`}>
                        <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                    </div>
                    );
                })}
              </div>
              <form onSubmit={handleSubmit} className="flex space-x-3 p-3 sm:p-4 border-t border-gray-700/50 bg-gray-950/50">
                <input 
                  ref={inputRef} 
                  type="text" 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  placeholder={
                    ticTacToeState && ticTacToeState.status === 'playing' && ticTacToeState.currentPlayer === ticTacToeState.humanSymbol 
                      ? "Click board or type comment..." 
                      : ticTacToeState 
                        ? "Game in progress..." 
                        : (activeChatId ? "Message your AI... 🤖" : "Select or create a chat to begin")
                  } 
                  className="flex-grow p-3 bg-gray-800 border border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all duration-150 placeholder-gray-500 text-slate-100 text-sm sm:text-base" 
                  disabled={isLoading || !activeChatId || (ticTacToeState?.status === 'playing' && ticTacToeState?.currentPlayer === ticTacToeState?.aiSymbol && !isFetchingCommentary)} 
                />
                <button 
                  type="submit" 
                  disabled={isLoading || !activeChatId || (ticTacToeState?.status === 'playing' && ticTacToeState?.currentPlayer === ticTacToeState?.aiSymbol && !isFetchingCommentary) || (input.trim() === "" && !(ticTacToeState && ticTacToeState.status === 'playing' && ticTacToeState.currentPlayer === ticTacToeState.humanSymbol))} 
                  className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950 transition-all duration-150 transform active:scale-95 hover:shadow-lg hover:shadow-purple-500/40"
                > 
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 sm:w-6 sm:h-6 text-white">
                    <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" />
                    <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" transform="translate(3 0)" />
                  </svg> 
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {" "}
            {/* Regular Chat UI */}
            <div
              ref={chatContainerRef}
              className="flex-grow p-4 sm:p-6 space-y-4 overflow-y-auto smooth-scroll custom-scrollbar"
            >
              {activeChatId && currentMessages.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  {" "}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-16 h-16 mb-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-3.861 8.25-8.625 8.25S3.75 16.556 3.75 12s3.861-8.25 8.625-8.25S21 7.444 21 12Z"
                    />
                  </svg>
                  <p>No messages yet. Start the conversation!</p>
                </div>
              )}
              {!activeChatId && chatSessions.length > 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-16 h-16 mb-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                  <p>Select a chat from the sidebar or create a new one.</p>
                </div>
              )}
              {currentMessages.map((msg) => {
                // Re-pasting the improved message styling logic here
                let bubbleBaseStyle =
                  "max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl shadow-lg";
                let bubbleRoleStyle = "";
                let messageContainerStyle = `flex animate-fadeInEnhanced my-1 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`;

                if (msg.messageType === "ai_thinking") {
                  bubbleRoleStyle =
                    "bg-transparent text-purple-300 italic shadow-none px-0";
                  messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-2 text-center w-full`;
                } else if (msg.messageType === "user_action") {
                  bubbleRoleStyle =
                    "bg-purple-600/90 text-white rounded-br-none opacity-90";
                } else if (msg.messageType === "system_info") {
                  bubbleRoleStyle =
                    "bg-gray-700/80 text-slate-300 italic shadow-none text-xs px-3 py-1";
                  messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-1 text-center w-full`;
                } else if (msg.role === "user") {
                  bubbleRoleStyle = "bg-purple-600 text-white rounded-br-none";
                } else {
                  // Assistant's commentary or regular messages
                  bubbleRoleStyle =
                    "bg-gray-800 text-slate-200 rounded-bl-none";
                }
                return (
                  <div key={msg.id} className={messageContainerStyle}>
                    {" "}
                    <div className={`${bubbleBaseStyle} ${bubbleRoleStyle}`}>
                      {" "}
                      <p className="text-sm sm:text-base whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>{" "}
                    </div>{" "}
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start animate-fadeInEnhanced">
                  <div className="max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl shadow-lg bg-gray-800 text-slate-200 rounded-bl-none">
                    <p className="text-sm sm:text-base whitespace-pre-wrap animate-pulse">
                      Thinking...
                    </p>
                  </div>
                </div>
              )}
            </div>
            <form
              onSubmit={handleSubmit}
              className="flex space-x-3 p-3 sm:p-4 border-t border-gray-700/50 bg-gray-950/50"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  activeChatId
                    ? "Message your AI... 🤖"
                    : "Select or create a chat to begin"
                }
                className="flex-grow p-3 bg-gray-800 border border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all duration-150 placeholder-gray-500 text-slate-100 text-sm sm:text-base"
                disabled={isLoading || !activeChatId}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim() || !activeChatId}
                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/50 disabled:text-slate-400 disabled:cursor-not-allowed rounded-xl font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-950 transition-all duration-150 transform active:scale-95 hover:shadow-lg hover:shadow-purple-500/40"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 sm:w-6 sm:h-6 text-white"
                >
                  <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" />
                  <path
                    d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z"
                    transform="translate(3 0)"
                  />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
