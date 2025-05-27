"use client";

import { useState, useEffect, FormEvent, useRef, ChangeEvent } from "react";
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
} from "../lib/ticTacToe"; // Make sure this path is correct (e.g., src/lib/ticTacToe)
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "../components/CodeBlock"; // Adjust path if your components folder is different
import Lottie, { LottieRefCurrentProps } from "lottie-react";

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
  images?: string[]; // Array of base64 encoded image strings
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  lastModifiedAt: string;
  titleGenerated?: boolean;
}

const OLLAMA_MODEL_NAME = "MyEGO-4B-GPU"; // User-specified model name

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
  const [showGameDropdown, setShowGameDropdown] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isSpeechModeActive, setIsSpeechModeActive] = useState<boolean>(false);
  const [isAiSpeakingTts, setIsAiSpeakingTts] = useState<boolean>(false); // To control Lottie animation
  const [lottieAnimationData, setLottieAnimationData] = useState<object | null>(
    null
  );
  const lottieControlRef = useRef<LottieRefCurrentProps | null>(null); // For controlling Lottie animation if needed

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTitling, setIsTitling] = useState<{ [chatId: string]: boolean }>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<
    string | null
  >(null);

  const [ticTacToeState, setTicTacToeState] =
    useState<TicTacToeGameState | null>(null);
  const [isAiThinkingMove, setIsAiThinkingMove] = useState<boolean>(false);
  const [isFetchingCommentary, setIsFetchingCommentary] =
    useState<boolean>(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  // inputRef was for a general input, textareaRef is now primary for text.
  // If inputRef is still needed for other purposes, it can be kept.
  // For focusing, textareaRef will be used for the main text input.

  // --- 3. useEffect Hooks ---
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
          handleNewChat(true);
        }
      } else {
        handleNewChat(true);
      }
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      localStorage.removeItem("chatSessions");
      localStorage.removeItem("activeChatId");
      handleNewChat(true);
    }
    if (typeof window !== "undefined") {
      setIsSidebarOpen(window.innerWidth >= 768);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chatSessions.length > 0 || localStorage.getItem("chatSessions")) {
      localStorage.setItem("chatSessions", JSON.stringify(chatSessions));
    }
  }, [chatSessions]);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem("activeChatId", activeChatId);
    } else if (chatSessions.length === 0) {
      localStorage.removeItem("activeChatId");
    }
  }, [activeChatId, chatSessions.length]);

  useEffect(() => {
    if (activeChatId && textareaRef.current && !ticTacToeState) {
      textareaRef.current.focus();
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
    if (textareaRef.current) textareaRef.current.focus();
    setTicTacToeState(null);
    return newChatId;
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setTicTacToeState(null);
    if (textareaRef.current) textareaRef.current.focus();
    if (typeof window !== "undefined" && window.innerWidth < 768)
      setIsSidebarOpen(false);
  };

  const handleDeleteChat = (chatIdToDelete: string) => {
    const sessionToDelete = chatSessions.find((s) => s.id === chatIdToDelete);
    if (!sessionToDelete) return;
    // Replace window.confirm with a custom modal in a real app
    const confirmDelete = confirm(
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
        setActiveChatId(null);
        handleNewChat();
      }
    }
  };

  const generateAndSetChatTitle = async (
    chatId: string,
    messagesForTitle: Message[]
  ) => {
    if (isTitling[chatId]) return;
    setIsTitling((prev) => ({ ...prev, [chatId]: true }));
    try {
      // Simulating API call for title generation
      // Replace with your actual API call to /api/generate-title or similar
      const userMessagesContent = messagesForTitle
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join(" ");
      const assistantMessagesContent = messagesForTitle
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join(" ");

      // Example prompt for title generation
      const titlePrompt = `Based on this conversation, suggest a short, concise title (max 5 words):
User: ${userMessagesContent.substring(0, 100)}...
Assistant: ${assistantMessagesContent.substring(0, 100)}...
Title:`;

      // Simulate API response
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay
      const generatedTitle =
        `${messagesForTitle[0].content.substring(0, 15)}` || "Generated Title";

      setChatSessions((prevSessions) =>
        prevSessions.map((session) =>
          session.id === chatId
            ? {
                ...session,
                title: generatedTitle.replace(/^"|"$/g, ""), // Remove quotes if any
                titleGenerated: true,
                lastModifiedAt: new Date().toISOString(),
              }
            : session
        )
      );
    } catch (error) {
      console.error("Error generating title:", error);
      // Optionally, set title to a fallback or leave as is
    } finally {
      setIsTitling((prev) => ({ ...prev, [chatId]: false }));
    }
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
      const newId = handleNewChat(true);
      if (!newId) return;
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
    setIsSidebarOpen(false); // Close sidebar when game starts
    setShowGameDropdown(false); // Close dropdown if open
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
          "Hmm, no valid moves for me? A flaw in the universe, surely. �",
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

  const handleSubmit = async (
    e: FormEvent<HTMLFormElement | HTMLTextAreaElement> // Allow HTMLTextAreaElement for direct calls from onKeyDown
  ) => {
    e.preventDefault();
    const trimmedInput = input.trim();

    // Allow sending if there's an image, even if text input is empty (unless in game where text might be for comments)
    if ((!trimmedInput && !selectedImageFile) || !activeChatId || isLoading) {
      if (
        ticTacToeState &&
        ticTacToeState.status === "playing" &&
        ticTacToeState.currentPlayer === ticTacToeState.humanSymbol &&
        trimmedInput
      ) {
        // Allow submitting just a comment during TicTacToe if input is not empty
      } else {
        return;
      }
    }

    if (trimmedInput.toLowerCase() === "/play tic-tac-toe") {
      initiateTicTacToe();
      setInput("");
      setSelectedImageFile(null);
      setSelectedImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

    if (ticTacToeState && ticTacToeState.status !== "ended") {
      if (trimmedInput) {
        addMessageToActiveChat({
          id: uuidv4(),
          role: "user",
          content: trimmedInput,
          isGameMessage: true,
          messageType: "user_action",
        });
      }
      setInput("");
      // Keep selected image if any for TTT comments? For now, clearing it.
      setSelectedImageFile(null);
      setSelectedImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      return;
    }

    // Regular chat logic
    let imageForMessageUIDisplay: string[] | undefined = undefined;
    if (selectedImagePreview) {
      imageForMessageUIDisplay = [selectedImagePreview]; // Full Data URL for UI
    }

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: trimmedInput,
      images: selectedImagePreview ? [selectedImagePreview] : undefined, // Store the full data URL
    };

    // --- Crucial change for preventing double messages and ensuring history ---
    // 1. Get the current messages *before* adding the new one, to build the history for the API.
    // 2. Then, update the state with the new message.

    let messagesForApiCall: Message[] = [];
    const currentActiveChat = chatSessions.find((s) => s.id === activeChatId);
    if (currentActiveChat) {
      messagesForApiCall = [...currentActiveChat.messages, userMessage]; // History *including* the new user message
    } else {
      messagesForApiCall = [userMessage]; // For a brand new chat where activeChat might not be in chatSessions yet
    }

    // Optimistically update UI with user message *after* constructing messagesForApiCall
    addMessageToActiveChat(userMessage);

    // Clear inputs now that userMessage object is created and added to state
    setInput("");
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    setIsLoading(true);
    let finalAssistantResponseContent = "";
    const assistantMessageId = uuidv4();
    let errorOccurredDuringStream = false;

    // Add placeholder for assistant's message
    addMessageToActiveChat({
      id: assistantMessageId,
      role: "assistant",
      content: "", // Start with empty content for streaming
    });

    try {
      // Prepare messages for the API, stripping data URL prefix from images
      const processedMessagesForApi = messagesForApiCall.map((msg) => ({
        role: msg.role,
        content: msg.content,
        // Ensure only the base64 part is sent for images to Ollama backend
        images: msg.images
          ? msg.images.map((imgDataUrl) =>
              imgDataUrl.includes(",") ? imgDataUrl.split(",")[1] : imgDataUrl
            )
          : undefined,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: processedMessagesForApi.slice(-50), // Send last 50 messages (including latest user one)
          model: OLLAMA_MODEL_NAME, // Ensure this is defined: const MAIN_OLLAMA_MODEL_NAME = 'your_main_model';
        }),
      });

      if (!response.ok || !response.body) {
        const errTxt = await response.text();
        errorOccurredDuringStream = true;
        throw new Error(
          `API err: ${response.statusText}. ${errTxt || response.status}`
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponseAccumulator = "";
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
              if (
                parsedChunk.message &&
                typeof parsedChunk.message.content === "string"
              ) {
                assistantResponseAccumulator += parsedChunk.message.content;
                finalAssistantResponseContent = assistantResponseAccumulator; // Keep track of full response

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
            } catch (error) {
              /* console.error("Error parsing JSON line from stream:", line, error); */
            }
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
      errorOccurredDuringStream = true; // Mark that an error happened
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === activeChatId
            ? {
                ...s,
                messages: s.messages.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: errMsg } // Update placeholder with error
                    : msg
                ),
              }
            : s
        )
      );
    } finally {
      setIsLoading(false);
      // if (textareaRef.current) textareaRef.current.focus(); // Auto-focus logic (consider mobile)

      // --- Text-to-Speech call if in Speech Mode ---
      if (
        isSpeechModeActive &&
        finalAssistantResponseContent &&
        !errorOccurredDuringStream
      ) {
        const textToSpeak = finalAssistantResponseContent
          .replace(/```[\s\S]*?```/g, "(Code block presented)")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/(\*\*|__)(.*?)\1/g, "$2") // Bold
          .replace(/(\*|_)(.*?)\1/g, "$2") // Italics
          .replace(/#{1,6}\s*(.*)/g, "$1"); // Headings
        speakText(textToSpeak); // Assuming speakText and isSpeechModeActive are defined
      }

      // Title Generation Logic
      // Re-fetch the session from the potentially updated chatSessions state
      const finalChatSessionForTitling = chatSessions.find(
        (s) => s.id === activeChatId
      );
      if (finalChatSessionForTitling && activeChatId && !ticTacToeState) {
        if (
          !finalChatSessionForTitling.titleGenerated &&
          finalChatSessionForTitling.title.startsWith("New Chat")
        ) {
          const userMessagesInChat = finalChatSessionForTitling.messages.filter(
            (m) => m.role === "user"
          );
          if (
            userMessagesInChat.length === 2 &&
            finalAssistantResponseContent &&
            !errorOccurredDuringStream
          ) {
            // Use the messages from finalChatSessionForTitling as it's the most current
            generateAndSetChatTitle(
              activeChatId,
              finalChatSessionForTitling.messages
            );
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

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [currentMessages]); // Depends on currentMessages of active chat

  const TicTacToeGameUI = () => {
    if (!ticTacToeState) return null;
    const neonColorX = "text-cyan-400";
    const neonColorO = "text-pink-500";
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
              {" "}
              X{" "}
            </button>
            <button
              onClick={() => handleSymbolChoice("O")}
              className={`px-6 py-3 rounded-lg font-bold text-3xl ${neonColorO} bg-gray-800 hover:bg-gray-700 shadow-md hover:shadow-pink-500/50 transition-all`}
            >
              {" "}
              O{" "}
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
                className={`w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 flex items-center justify-center text-4xl md:text-5xl font-bold bg-gray-800/50 rounded-sm transition-all duration-150 ease-in-out
                           ${
                             value === null &&
                             ticTacToeState.status === "playing" &&
                             ticTacToeState.currentPlayer ===
                               ticTacToeState.humanSymbol
                               ? `${neonCellHoverBg} cursor-pointer`
                               : "cursor-not-allowed"
                           }
                           ${getSymbolStyle(
                             value
                           )} border border-purple-600/30 hover:border-purple-500/70`}
                aria-label={`Square ${index + 1}${
                  value ? `, marked ${value}` : ", empty"
                }`}
              >
                {" "}
                {value}{" "}
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
                  {" "}
                  {ticTacToeState.currentPlayer}{" "}
                </span>
                {ticTacToeState.currentPlayer === ticTacToeState.humanSymbol
                  ? " (Your move, try not to disappoint. 😒)"
                  : " (My move, prepare for ingenuity. 🤔)"}
              </p>
            )}
        </div>
      );
    }
    return null;
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ];
      if (!allowedTypes.includes(file.type)) {
        // Use custom modal instead of alert
        console.warn(
          "Invalid file type. Please select a PNG, JPEG, WEBP, or GIF."
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        // 5MB limit
        // Use custom modal instead of alert
        console.warn(
          "Image is too large. Please select an image smaller than 5MB."
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedImageFile(null);
      setSelectedImagePreview(null);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const removeSelectedImage = () => {
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      let scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 120; // Approx 5 lines for sm text
      if (scrollHeight > maxHeight) {
        textareaRef.current.style.height = `${maxHeight}px`;
        textareaRef.current.style.overflowY = "auto";
      } else {
        textareaRef.current.style.height = `${scrollHeight}px`;
        textareaRef.current.style.overflowY = "hidden";
      }
    }
  };

  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event as any); // Cast event type if handleSubmit relies on form event specifics
    }
  };

  // Helper function to determine the group key for a session for sidebar display
  const getSessionGroupKeyForDisplay = (
    sessionDate: Date,
    now: Date
  ): string => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgoDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6
    ); // Date 7 days ago (inclusive of today)

    const sessionDayStart = new Date(
      sessionDate.getFullYear(),
      sessionDate.getMonth(),
      sessionDate.getDate()
    );

    if (
      sessionDayStart.getTime() >= sevenDaysAgoDate.getTime() &&
      sessionDayStart.getTime() <= today.getTime()
    ) {
      return "7 Days";
    } else {
      // Format as YYYY-MM for older chats, e.g., "2025-03"
      return `${sessionDate.getFullYear()}-${String(
        sessionDate.getMonth() + 1
      ).padStart(2, "0")}`;
    }
  };

  // Function to group sessions for sidebar display
  const groupSessionsForSidebar = (
    sessions: ChatSession[]
  ): { groupTitle: string; sessions: ChatSession[] }[] => {
    if (!sessions || sessions.length === 0) return [];

    const now = new Date();
    const grouped: Record<string, ChatSession[]> = {};

    // Sessions are already sorted by lastModifiedAt descending by `sortedChatSessions`
    sessions.forEach((session) => {
      const sessionDate = new Date(session.lastModifiedAt);
      const key = getSessionGroupKeyForDisplay(sessionDate, now);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(session); // Sessions within a group will maintain their pre-sorted order
    });

    const orderedGroupKeys = Object.keys(grouped).sort((a, b) => {
      if (a === "7 Days") return -1;
      if (b === "7 Days") return 1;
      return b.localeCompare(a); // Sort "YYYY-MM" keys reverse chronologically
    });

    return orderedGroupKeys.map((key) => ({
      groupTitle: key,
      sessions: grouped[key],
    }));
  };

  // --- useEffect for loading Lottie data ---
  useEffect(() => {
    fetch("/skull-speaking.json") // Your Lottie file path
      .then((response) => response.json())
      .then((data) => {
        setLottieAnimationData(data);
        // Ensure animation is stopped initially after loading data
        // and lottieControlRef.current is available
        setTimeout(() => {
          if (lottieControlRef.current) {
            lottieControlRef.current.stop();
          }
          setIsAiSpeakingTts(false); // Set initial speaking state to false
        }, 100); // Timeout ensures ref is bound
      })
      .catch((error) =>
        console.error("Error loading Lottie animation:", error)
      );
  }, []);

  // --- TTS Functions with Lottie Control ---
  const speakText = (text: string) => {
    if (!("speechSynthesis" in window)) {
      addSystemMessage(
        "My apologies, vocal processors are offline in this browser. 😒",
        "system_info"
      );
      return;
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel(); // Stop current speech to start new
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {
      setIsAiSpeakingTts(true);
      lottieControlRef.current?.play(); // Play Lottie animation
    };
    utterance.onend = () => {
      setIsAiSpeakingTts(false);
      lottieControlRef.current?.stop(); // Stop Lottie and reset to frame 0
    };
    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
      setIsAiSpeakingTts(false);
      lottieControlRef.current?.stop(); // Stop Lottie on error
      addSystemMessage(
        `My vocal modulator... an anomaly: ${event.error}. How droll. 🙄`,
        "system_info"
      );
    };
    speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel(); // This will trigger utterance.onend
    } else {
      setIsAiSpeakingTts(false); // Ensure state is correct
      lottieControlRef.current?.stop(); // Stop Lottie and reset
    }
  };

  const toggleSpeechMode = () => {
    const newMode = !isSpeechModeActive;
    setIsSpeechModeActive(newMode);
    if (newMode) {
      // Entering speech mode
      setIsAiSpeakingTts(false);
      setTimeout(() => lottieControlRef.current?.stop(), 0); // Ensure animation is stopped
      if (typeof window !== "undefined" && window.innerWidth < 768)
        setIsSidebarOpen(false);
    } else {
      // Exiting speech mode
      stopSpeaking();
    }
  };

  const groupedSessionsForDisplay = groupSessionsForSidebar(sortedChatSessions);

  return (
    <div className="flex min-h-screen h-full text-slate-200 font-sofia relative overflow-hidden antialiased px-safe py-safe">
      <div className="absolute inset-0 z-0 animated-gradient"></div>

      {/* === UPDATED SIDEBAR SECTION === */}
      {!ticTacToeState && (
        <div
          className={`fixed inset-y-0 left-0 z-40 flex flex-col space-y-6 bg-gray-900/90 backdrop-blur-lg border-r border-gray-700/60 shadow-2xl
                     transition-transform duration-300 ease-in-out transform ${
                       isSidebarOpen
                         ? "translate-x-0 w-72 sm:w-80 p-3" // Adjusted padding
                         : "-translate-x-full w-72 max-w-[300px] sm:w-80 p-3"
                     } 
                     md:relative md:translate-x-0 md:w-80 lg:w-96 md:p-4`} // Adjusted padding for md
        >
          {/* Mobile close button - keep it for usability on small screens */}
          <div className="flex items-center justify-end mb-2 md:hidden">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200"
              aria-label="Close sidebar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="w-full flex items-center gap-2">
            <svg
              version="1.0"
              xmlns="http://www.w3.org/2000/svg"
              width="50.000000pt"
              height="50.000000pt"
              viewBox="0 0 360.000000 360.000000"
              preserveAspectRatio="xMidYMid meet"
            >
              <g
                transform="translate(0.000000,360.000000) scale(0.100000,-0.100000)"
                fill="#e2e8f0"
                stroke="none"
              >
                <path
                  d="M1644 3343 c4 -54 9 -118 11 -143 3 -35 1 -31 -10 20 -8 36 -14 88
-15 115 -1 76 -8 95 -37 95 -23 0 -25 -3 -18 -32 12 -62 28 -709 17 -720 -7
-7 -11 87 -14 299 -4 254 -8 320 -23 376 -9 37 -23 67 -29 67 -63 0 -360 -122
-372 -153 -5 -13 16 -336 32 -492 4 -40 3 -57 -4 -50 -9 9 -25 162 -48 443 -4
45 -9 82 -11 82 -3 0 -31 -21 -64 -46 -58 -46 -59 -48 -59 -98 0 -28 4 -89 10
-135 5 -46 12 -142 14 -215 l6 -131 -25 170 c-13 94 -24 205 -25 248 0 42 -4
77 -8 77 -15 0 -109 -123 -145 -190 -20 -36 -48 -96 -63 -135 -22 -59 -25 -80
-20 -134 5 -56 12 -74 57 -140 50 -75 51 -77 47 -139 -4 -60 -11 -74 -43 -85
-6 -2 -2 -62 13 -163 30 -215 27 -221 -13 -22 -19 93 -37 172 -40 178 -3 5
-13 10 -21 10 -27 0 -91 39 -112 67 -36 50 -43 22 -40 -173 l3 -179 65 -42
c36 -23 73 -50 82 -59 24 -24 57 -114 64 -178 6 -49 4 -57 -19 -80 -14 -14
-36 -26 -48 -26 -11 0 -48 23 -81 50 -50 42 -88 62 -88 47 0 -21 73 -287 88
-320 18 -41 28 -48 130 -101 l111 -56 -4 102 c-4 101 -4 101 6 33 22 -156 17
-146 88 -175 57 -23 64 -29 66 -55 1 -17 5 -38 9 -47 7 -16 2 -18 -33 -18 -53
0 -62 -20 -27 -61 31 -37 32 -39 51 -204 18 -148 41 -245 90 -381 34 -93 104
-238 112 -231 2 2 -3 35 -11 74 -27 128 -39 291 -34 479 4 155 7 188 21 202
15 14 19 15 32 1 19 -19 40 -130 55 -289 10 -103 16 -132 36 -162 18 -29 21
-38 10 -38 -8 0 -17 -4 -20 -9 -9 -14 143 -451 156 -451 2 0 4 94 4 209 2 174
5 214 19 241 15 29 20 32 48 27 124 -23 162 -27 237 -27 47 0 116 7 155 15 92
20 92 20 111 -16 12 -25 17 -76 21 -241 7 -242 -3 -246 99 42 64 182 67 193
50 206 -17 12 -17 14 2 41 13 19 22 53 26 103 21 229 48 360 75 360 29 0 36
-37 39 -230 4 -199 -5 -331 -33 -464 -8 -38 -13 -72 -10 -74 8 -9 86 161 125
275 41 116 71 266 85 413 8 79 15 102 48 137 29 32 16 53 -32 53 -40 0 -40 1
-30 27 5 14 8 35 7 46 -2 16 9 25 61 47 76 30 75 28 91 193 7 65 14 116 16
114 3 -2 0 -60 -5 -128 -5 -68 -7 -126 -5 -128 7 -7 203 91 218 109 17 19 49
118 76 230 11 47 22 95 26 108 10 35 -15 27 -83 -28 -34 -27 -71 -50 -83 -50
-11 0 -33 12 -47 26 -23 23 -25 31 -19 79 7 62 41 157 65 180 9 9 45 35 81 58
l65 42 3 179 c3 198 -3 221 -43 170 -21 -26 -62 -51 -116 -67 -11 -4 -24 -46
-47 -159 -17 -84 -33 -164 -35 -178 l-4 -25 -2 25 c0 14 8 81 19 150 25 161
25 174 -5 204 -21 21 -25 35 -25 80 0 48 5 62 50 128 83 124 80 200 -16 388
-40 78 -137 210 -154 210 -4 0 -10 -57 -14 -127 -4 -71 -15 -182 -26 -248
l-19 -120 5 125 c4 110 13 221 29 357 4 40 3 42 -58 92 -34 28 -65 51 -68 51
-4 0 -9 -42 -13 -92 -12 -168 -37 -422 -41 -427 -9 -9 -5 117 11 317 9 111 13
209 10 217 -12 33 -305 155 -370 155 -7 0 -21 -32 -31 -72 -15 -60 -20 -128
-24 -383 -5 -216 -9 -298 -15 -270 -9 38 8 616 21 698 5 34 3 37 -20 37 -21 0
-25 -5 -31 -46 -3 -26 -6 -65 -7 -88 -1 -23 -5 -52 -10 -66 -5 -16 -7 16 -3
86 6 134 21 124 -180 124 l-138 0 6 -97z m303 -175 c-3 -7 -5 -2 -5 12 0 14 2
19 5 13 2 -7 2 -19 0 -25z m-249 -1118 c0 -85 -3 -166 -7 -180 -11 -36 -21
328 -20 664 l2 291 13 -310 c6 -170 12 -380 12 -465z m226 30 c-7 -225 -9
-238 -17 -165 -6 52 -6 194 2 410 6 182 12 364 14 405 1 41 3 -33 5 -165 2
-132 0 -350 -4 -485z m-320 -78 c-13 -26 -21 160 -14 328 l5 145 8 -228 c5
-125 5 -235 1 -245z m406 83 c-5 -87 -7 -57 -7 140 0 225 1 236 7 110 4 -77 4
-190 0 -250z m537 23 c-3 -8 -6 -5 -6 6 -1 11 2 17 5 13 3 -3 4 -12 1 -19z
m-115 -166 c-4 -39 -7 -72 -4 -72 2 0 34 18 70 39 60 35 103 47 155 42 23 -2
23 -56 -3 -152 -60 -228 -89 -319 -107 -345 -11 -15 -49 -44 -84 -64 l-64 -36
-10 -64 -10 -65 -3 58 c-3 63 -13 74 -55 58 -25 -10 -26 -14 -30 -93 l-3 -83
-2 87 c-1 48 -5 89 -9 91 -5 3 -23 8 -40 12 l-33 7 -1 -79 c-1 -43 -4 -116 -8
-163 l-6 -85 -7 65 c-4 36 -3 110 2 165 5 55 6 102 4 105 -3 3 -35 25 -72 50
-36 25 -65 48 -64 53 1 4 2 30 2 59 0 50 2 54 58 108 31 30 109 90 173 132
l116 77 12 89 c6 48 11 100 11 114 0 13 3 28 8 32 11 12 14 -62 4 -142z
m-1252 112 c0 -15 5 -67 12 -116 l12 -89 115 -77 c64 -41 142 -101 173 -132
56 -54 58 -58 58 -108 0 -29 1 -55 2 -59 1 -5 -29 -29 -67 -55 -55 -37 -70
-52 -68 -70 8 -118 11 -338 4 -316 -5 15 -12 95 -16 178 -5 101 -11 150 -19
149 -6 -1 -22 -4 -36 -8 -24 -6 -25 -11 -31 -96 l-5 -90 -2 86 -2 87 -31 6
c-17 3 -35 3 -40 0 -5 -3 -10 -31 -10 -62 l-1 -57 -12 65 -11 64 -64 36 c-35
20 -72 49 -84 64 -17 24 -55 145 -113 366 -8 30 -14 71 -14 92 l0 38 53 0 c35
0 63 -7 87 -21 19 -12 50 -30 69 -42 l34 -21 -7 107 c-4 71 -3 107 4 107 5 0
10 -12 10 -26z m-333 -156 c-3 -7 -5 -2 -5 12 0 14 2 19 5 13 2 -7 2 -19 0
-25z m1910 -15 c-3 -10 -5 -2 -5 17 0 19 2 27 5 18 2 -10 2 -26 0 -35z m-1900
-65 c-3 -7 -5 -2 -5 12 0 14 2 19 5 13 2 -7 2 -19 0 -25z m1890 -5 c-3 -10 -5
-4 -5 12 0 17 2 24 5 18 2 -7 2 -21 0 -30z m-1868 -157 c2 -66 -6 -35 -12 49
-4 60 -3 69 3 35 5 -25 9 -63 9 -84z m1856 39 c-4 -42 -10 -74 -12 -71 -3 2
-2 39 2 81 4 42 10 74 12 71 3 -2 2 -39 -2 -81z m-1848 -182 c-3 -10 -5 -2 -5
17 0 19 2 27 5 18 2 -10 2 -26 0 -35z m973 -134 c9 -4 48 -98 88 -210 80 -221
79 -216 28 -298 l-26 -41 -42 21 c-56 29 -160 29 -216 0 l-40 -20 -15 22 c-8
12 -24 41 -35 64 l-22 42 20 63 c11 35 44 128 74 208 51 138 55 146 87 157 33
11 68 8 99 -8z m307 -656 c-3 -10 -5 -4 -5 12 0 17 2 24 5 18 2 -7 2 -21 0
-30z m-730 5 c-3 -8 -6 -5 -6 6 -1 11 2 17 5 13 3 -3 4 -12 1 -19z"
                />
              </g>
            </svg>
            <h1 className="text-4xl font-audiowide font-bold text-slate-200 tracking-widest pointer-events-none">
              exogtic
            </h1>
          </div>

          {/* New Chat Button - Styled like the image */}
          <button
            onClick={() => {
              handleNewChat();
              if (typeof window !== "undefined" && window.innerWidth < 768)
                setIsSidebarOpen(false);
            }}
            className="mb-3 max-w-[150px] py-2 px-3 bg-slate-700 new-chat-btn rounded-xl text-white font-medium text-sm shadow-md transition-colors duration-200 ease-in-out active:scale-[0.98] flex items-center justify-center space-x-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9.10999 27C8.92999 27 8.76001 26.96 8.60001 26.9C8.43001 26.83 8.29 26.74 8.16 26.61C8.03 26.49 7.94 26.3499 7.87 26.1899C7.79999 26.0299 7.76001 25.8599 7.76001 25.6899L7.73001 23.04C7.34001 22.98 6.95001 22.8799 6.57001 22.7599C6.19001 22.6299 5.83001 22.48 5.48001 22.29C5.13001 22.1 4.79999 21.88 4.48999 21.63C4.17999 21.39 3.89 21.1199 3.63 20.82C3.37 20.52 3.13999 20.21 2.92999 19.87C2.72999 19.53 2.56001 19.18 2.42001 18.82C2.28001 18.45 2.17001 18.07 2.10001 17.69C2.03001 17.3 2 16.92 2 16.53V9.46995C2 9.03995 2.04 8.61995 2.12 8.19995C2.21 7.77995 2.34 7.36995 2.5 6.96995C2.67 6.57995 2.88 6.19995 3.12 5.84995C3.36 5.48995 3.64001 5.15995 3.95001 4.85995C4.26001 4.55995 4.59999 4.28995 4.95999 4.04995C5.32999 3.80995 5.70999 3.60995 6.10999 3.44995C6.51999 3.27995 6.94 3.15995 7.37 3.07995C7.79999 2.98995 8.23001 2.94995 8.67001 2.94995H13.3C13.46 2.94995 13.61 2.97995 13.76 3.03995C13.9 3.09995 14.03 3.17995 14.14 3.28995C14.25 3.39995 14.33 3.51995 14.39 3.65995C14.45 3.79995 14.48 3.94995 14.48 4.09995C14.48 4.25995 14.45 4.39995 14.39 4.54995C14.33 4.68995 14.25 4.80995 14.14 4.91995C14.03 5.02995 13.9 5.10995 13.76 5.16995C13.61 5.22995 13.46 5.25995 13.3 5.25995H8.67001C8.38001 5.25995 8.09999 5.27995 7.82999 5.33995C7.54999 5.38995 7.27999 5.46995 7.01999 5.57995C6.75999 5.67995 6.50999 5.80995 6.26999 5.96995C6.03999 6.11995 5.82 6.29995 5.62 6.48995C5.42 6.68995 5.23999 6.89995 5.07999 7.12995C4.92999 7.35995 4.78999 7.59995 4.67999 7.85995C4.57999 8.10995 4.49 8.37995 4.44 8.64995C4.38 8.91995 4.35999 9.18995 4.35999 9.46995V16.53C4.35999 16.81 4.38 17.08 4.44 17.36C4.5 17.63 4.58 17.9 4.69 18.16C4.8 18.42 4.93 18.67 5.09 18.9C5.25 19.13 5.43001 19.3499 5.64001 19.5499C5.84001 19.75 6.05999 19.92 6.29999 20.08C6.53999 20.24 6.79 20.37 7.06 20.47C7.32 20.58 7.6 20.66 7.88 20.72C8.16001 20.77 8.44001 20.7999 8.73001 20.7999C8.91001 20.7999 9.08 20.83 9.25 20.9C9.41 20.97 9.55999 21.0599 9.67999 21.18C9.80999 21.3099 9.91001 21.45 9.98001 21.61C10.05 21.77 10.08 21.94 10.09 22.11L10.1 23.74L13.08 21.61C13.84 21.07 14.69 20.7999 15.63 20.7999H19.32C19.61 20.7999 19.89 20.77 20.16 20.72C20.44 20.67 20.71 20.59 20.97 20.4799C21.23 20.3699 21.48 20.24 21.72 20.09C21.95 19.94 22.17 19.76 22.37 19.57C22.57 19.3699 22.75 19.16 22.91 18.93C23.07 18.7 23.2 18.46 23.31 18.2C23.41 17.95 23.5 17.68 23.55 17.41C23.61 17.14 23.63 16.87 23.63 16.59V12.94C23.63 12.79 23.66 12.64 23.72 12.5C23.78 12.36 23.87 12.23 23.98 12.13C24.09 12.02 24.22 11.93 24.36 11.88C24.51 11.82 24.66 11.79 24.82 11.79C24.97 11.79 25.12 11.82 25.27 11.88C25.41 11.93 25.54 12.02 25.65 12.13C25.76 12.23 25.85 12.36 25.91 12.5C25.97 12.64 26 12.79 26 12.94V16.59C26 17.02 25.95 17.44 25.87 17.86C25.78 18.28 25.66 18.69 25.49 19.08C25.32 19.48 25.11 19.8499 24.87 20.2099C24.63 20.57 24.35 20.9 24.04 21.2C23.73 21.5 23.39 21.7699 23.03 22.0099C22.67 22.2499 22.28 22.45 21.88 22.61C21.47 22.77 21.06 22.9 20.63 22.9799C20.2 23.07 19.76 23.11 19.32 23.11H16.4C15.47 23.11 14.62 23.3799 13.86 23.9199L9.91 26.74C9.67 26.91 9.39999 27 9.10999 27Z"
                fill="currentColor"
              ></path>
              <path
                d="M24.6805 5.14453H18.1874C17.5505 5.14453 17.0342 5.66086 17.0342 6.29778C17.0342 6.9347 17.5505 7.45102 18.1874 7.45102H24.6805C25.3175 7.45102 25.8338 6.9347 25.8338 6.29778C25.8338 5.66086 25.3175 5.14453 24.6805 5.14453Z"
                fill="currentColor"
              ></path>
              <path
                d="M22.6137 3.1804C22.6137 2.52848 22.0852 2 21.4333 2C20.7814 2 20.2529 2.52848 20.2529 3.1804V9.4168C20.2529 10.0687 20.7814 10.5972 21.4333 10.5972C22.0852 10.5972 22.6137 10.0687 22.6137 9.4168V3.1804Z"
                fill="currentColor"
              ></path>
            </svg>
            <span>New chat</span>
          </button>

          {/* Chat History List with Grouping */}
          <div className="flex-grow overflow-y-auto space-y-1 custom-scrollbar pr-1">
            {groupedSessionsForDisplay.map((group) => (
              <div key={group.groupTitle} className="mt-1">
                <h3 className="px-2.5 pt-2 pb-1 text-xs text-gray-400 uppercase tracking-wider font-semibold">
                  {group.groupTitle}
                </h3>
                {group.sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSelectChat(session.id)}
                    className={`group p-2.5 rounded-md cursor-pointer transition-all duration-150 ease-in-out transform hover:bg-gray-700/60 active:scale-[0.99] ${
                      activeChatId === session.id
                        ? "bg-gray-700/80" // Subtle active state, image doesn't show strong active state
                        : "hover:bg-gray-750/50" // Matched hover from original
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-sm font-medium truncate ${
                          activeChatId === session.id
                            ? "text-slate-50"
                            : "text-slate-200" // Brighter text for active
                        } group-hover:text-white ${
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
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-600/40 text-red-400 hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-500"
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
                    {/* Removed individual chat date as per image */}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Speech Mode Toggle Button */}
          <button
            onClick={toggleSpeechMode}
            className={`w-full mt-3 mb-2 p-2.5 rounded-lg text-white font-semibold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center space-x-2
                            ${
                              isSpeechModeActive
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-teal-600 hover:bg-teal-700"
                            }`}
          >
            {/* Mic or Skull Icon */}
            {isSpeechModeActive ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M7 4a3 3 0 0 1 6 0v4a3 3 0 1 1-6 0V4Zm4 10.93A7.001 7.001 0 0 0 17 8a1 1 0 1 0-2 0A5 5 0 0 1 5 8a1 1 0 0 0-2 0 7.001 7.001 0 0 0 6 6.93V17H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07Z" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M7 4a3 3 0 0 1 6 0v4a3 3 0 1 1-6 0V4Zm4 10.93A7.001 7.001 0 0 0 17 8a1 1 0 1 0-2 0A5 5 0 0 1 5 8a1 1 0 0 0-2 0 7.001 7.001 0 0 0 6 6.93V17H7a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.07Z" />
              </svg>
            )}
            <span>
              {isSpeechModeActive ? "Exit Speech Mode" : "Enter Speech Mode"}
            </span>
          </button>
        </div>
      )}
      {/* === END OF UPDATED SIDEBAR SECTION === */}

      <div
        className={`relative z-10 flex-grow flex flex-col bg-gray-950/60 backdrop-blur-xl shadow-2xl ${
          !ticTacToeState ? "md:border-l" : "w-full"
        } border-gray-700/50 overflow-hidden`}
      >
        <header className="p-3 border-b border-gray-700/50 flex items-center flex-shrink-0 space-x-2">
          {!ticTacToeState && !isSpeechModeActive && (
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 text-slate-300 hover:text-purple-400 rounded-md md:hidden"
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5 sm:w-6 sm:h-6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
              )}
            </button>
          )}
          {(ticTacToeState || isSpeechModeActive) && (
            <div className="w-8 h-8 md:hidden"></div>
          )}
          <h1 className="flex-grow text-center text-lg md:text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 truncate">
            {ticTacToeState
              ? "Tic-Tac-Toe Neon Grid 💥"
              : isSpeechModeActive
              ? "EGO - Speech Mode 💀"
              : activeChat?.title || "Exogtic AI 4B ✨"}
          </h1>
          {!ticTacToeState ? (
            <div className="w-8 h-8 md:hidden"></div>
          ) : (
            <div className="w-8 h-8 md:hidden"></div>
          )}
        </header>

        {isSpeechModeActive ? (
          // --- SPEECH MODE UI ---
          <div className="flex-grow flex flex-col items-center justify-center p-4 bg-black/50">
            {lottieAnimationData ? (
              <Lottie
                lottieRef={lottieControlRef} // Pass the ref here
                animationData={lottieAnimationData}
                loop={true}
                // autoplay={false} // Ensure it doesn't autoplay initially, control via ref
                style={{ width: "80%", maxWidth: "400px", height: "auto" }}
              />
            ) : (
              <p className="text-slate-400">Loading EGO's visage...</p>
            )}
            <p className="mt-4 text-sm text-slate-500">
              {isAiSpeakingTts
                ? "EGO is speaking..."
                : "EGO is listening... (Use input below)"}
            </p>
            <div className="w-full max-w-xl mt-auto px-2 pb-2 pt-1 sm:px-3 sm:pb-3 sm:pt-2">
              <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl p-2 sm:p-2.5 shadow-xl border border-gray-700/50">
                {selectedImagePreview && (
                  <div className="mb-2 p-1.5 border border-gray-600 rounded-lg relative w-20 h-20 sm:w-24 sm:h-24 bg-gray-700/40 mx-auto sm:mx-0">
                    <img
                      src={selectedImagePreview}
                      alt="Selected preview"
                      className="w-full h-full object-contain rounded"
                    />
                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0 w-5 h-5 flex items-center justify-center text-[0.6rem] leading-none shadow-md hover:bg-red-700 z-10"
                      aria-label="Remove image"
                    >
                      &times;
                    </button>
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={
                      activeChatId
                        ? "Message the AI or attach an image..."
                        : "Select or create a chat"
                    }
                    className="flex-grow w-full p-2 sm:p-2.5 bg-gray-700/60 border border-gray-600 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all placeholder-gray-400 text-slate-100 text-sm resize-none overflow-y-auto max-h-24 sm:max-h-32 custom-scrollbar"
                    disabled={
                      isLoading || !activeChatId || ticTacToeState !== null
                    }
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                      {/* Search Button (Dormant) */}
                      <button
                        type="button"
                        className="px-2.5 py-1.5 text-xs sm:text-sm rounded-md bg-gray-700/50 hover:bg-gray-600/50 text-slate-300 transition-colors flex items-center space-x-1 opacity-50 cursor-not-allowed"
                        title="Search (coming soon)"
                        disabled
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>Search</span>
                      </button>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Attach Image Button */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp, image/gif"
                      />
                      <button
                        type="button"
                        onClick={triggerImageUpload}
                        className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-slate-300 transition-colors"
                        aria-label="Attach image"
                        title="Attach image"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.53 9.53l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.452a1.125 1.125 0 0 0 1.59 1.591l3.455-3.553a3 3 0 0 0 0-4.242Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {/* Send Button */}
                      <button
                        type="submit"
                        disabled={
                          isLoading ||
                          (!input.trim() && !selectedImageFile) ||
                          !activeChatId ||
                          ticTacToeState !== null
                        }
                        className="p-2 sm:p-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold shadow-md focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all active:scale-95 hover:shadow-lg hover:shadow-purple-500/30 flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5 text-white"
                        >
                          <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" />
                          <path
                            d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z"
                            transform="translate(3 0)"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : ticTacToeState ? (
          <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
            <div className="h-[55vh] sm:h-[60vh] md:h-full w-full md:flex-[0_0_auto] md:w-[22rem] lg:w-[26rem] p-1 pt-2 sm:p-2 md:p-4 border-b md:border-b-0 md:border-r border-purple-500/30 flex items-center justify-center bg-gray-950/30 custom-scrollbar overflow-y-auto">
              <TicTacToeGameUI />
            </div>
            <div className="flex-grow flex flex-col bg-gray-950/60">
              <div
                ref={chatContainerRef}
                className="flex-grow p-2 sm:p-3 md:p-4 space-y-1.5 sm:space-y-2 overflow-y-auto smooth-scroll custom-scrollbar"
              >
                {currentMessages
                  .filter((msg) => msg.isGameMessage === true || ticTacToeState) // Ensure only game messages show here
                  .map((msg) => {
                    let bubbleBaseStyle =
                      "max-w-[90%] sm:max-w-[80%] px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl shadow-lg";
                    let bubbleRoleStyle = "";
                    let messageContainerStyle = `flex animate-fadeInEnhanced my-1 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`;
                    if (msg.messageType === "ai_thinking") {
                      bubbleRoleStyle =
                        "bg-transparent text-purple-300 italic shadow-none !px-0";
                      messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-1.5 text-center w-full`;
                    } else if (msg.messageType === "user_action") {
                      bubbleRoleStyle =
                        "bg-purple-600/90 text-white rounded-br-none opacity-90 text-xs sm:text-sm";
                    } else if (msg.messageType === "system_info") {
                      bubbleRoleStyle =
                        "bg-gray-700/80 text-slate-300 italic shadow-none text-xs px-2 py-1";
                      messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-1 text-center w-full`;
                    } else if (msg.role === "user") {
                      // Default user game message (if any other type)
                      bubbleRoleStyle =
                        "bg-purple-800 text-white rounded-br-none mb-2";
                    } else {
                      // Default assistant game message
                      bubbleRoleStyle =
                        "bg-gray-800 text-slate-200 rounded-bl-none";
                    }
                    return (
                      <div key={msg.id} className={messageContainerStyle}>
                        <div
                          className={`${bubbleBaseStyle} ${bubbleRoleStyle}`}
                        >
                          <div
                            className={`w-full prose prose-xs sm:prose-sm prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-pre:!m-0 prose-pre:!p-0 prose-pre:!bg-transparent prose-code:font-mono prose-code:text-purple-300 prose-code:px-[0.4em] prose-code:py-[0.2em] prose-code:bg-gray-700/50 prose-code:rounded-[0.2em] prose-code:text-xs`}
                          >
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{ code: CodeBlock }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="px-2 pb-2 pt-1 sm:px-3 sm:pb-3 sm:pt-2">
                <form
                  onSubmit={handleSubmit}
                  className="flex-shrink-0 sticky bottom-0 bg-gray-800/90 backdrop-blur-sm rounded-xl p-1.5 sm:p-2 shadow-xl border border-gray-700/50"
                >
                  <div className="flex items-center space-x-1.5 sm:space-x-2">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder={
                        ticTacToeState &&
                        ticTacToeState.status === "playing" &&
                        ticTacToeState.currentPlayer ===
                          ticTacToeState.humanSymbol
                          ? "Click board or type comment..."
                          : "Game in progress..."
                      }
                      className="flex-grow p-2 sm:p-2.5 bg-gray-700/50 border border-transparent rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all placeholder-gray-400 text-slate-100 text-xs sm:text-sm resize-none overflow-y-auto max-h-24 sm:max-h-32 custom-scrollbar"
                      disabled={
                        isLoading ||
                        !activeChatId ||
                        (ticTacToeState &&
                          ticTacToeState.status === "playing" &&
                          ticTacToeState?.currentPlayer ===
                            ticTacToeState?.aiSymbol &&
                          !isFetchingCommentary)
                      }
                    />
                    <button
                      type="submit"
                      disabled={
                        isLoading ||
                        !activeChatId ||
                        (ticTacToeState?.status === "playing" &&
                          ticTacToeState?.currentPlayer ===
                            ticTacToeState?.aiSymbol &&
                          !isFetchingCommentary) ||
                        (input.trim() === "" &&
                          !(
                            ticTacToeState &&
                            ticTacToeState.status === "playing" &&
                            ticTacToeState.currentPlayer ===
                              ticTacToeState.humanSymbol
                          ))
                      }
                      className="p-2 sm:p-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold shadow-md focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all active:scale-95 hover:shadow-lg hover:shadow-purple-500/30 flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-5 h-5 text-white"
                      >
                        <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" />
                        <path
                          d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z"
                          transform="translate(3 0)"
                        />
                      </svg>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <>
            {" "}
            {/* Regular Chat UI */}
            <div
              ref={chatContainerRef}
              className="flex-grow p-2 xs:p-2.5 sm:p-3 md:p-4 space-y-1.5 sm:space-y-2 overflow-y-auto smooth-scroll custom-scrollbar"
            >
              {activeChatId && currentMessages.length === 0 && !isLoading && (
                <div className="flex flex-col text-center items-center justify-center h-full text-gray-500">
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
                let bubbleBaseStyle =
                  "max-w-[90%] sm:max-w-[60%] px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl shadow-lg text-base";
                let bubbleRoleStyle = "";
                let messageContainerStyle = `flex animate-fadeInEnhanced my-1 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`;
                if (msg.messageType === "ai_thinking") {
                  // This specific type might not be used in regular chat
                  bubbleRoleStyle =
                    "bg-transparent text-purple-300 italic shadow-none !px-0";
                  messageContainerStyle = `flex justify-center animate-fadeInEnhanced my-1.5 text-center w-full`;
                } else if (msg.role === "user") {
                  bubbleRoleStyle = "bg-purple-600 text-white rounded-br-none";
                } else {
                  // Assistant
                  bubbleRoleStyle =
                    "bg-gray-800 text-slate-200 rounded-bl-none";
                }
                return (
                  <div key={msg.id} className={messageContainerStyle}>
                    <div className={`${bubbleBaseStyle} ${bubbleRoleStyle}`}>
                      {msg.role === "user" && msg.images && msg.images[0] && (
                        <div
                          className="
    mb-1.5 mt-0.5 rounded-md overflow-hidden 
    border border-purple-400/30 
    bg-black/20
    w-fit max-w-[250px] sm:max-w-[300px] 
    max-h-[200px] sm:max-h-[250px]      
    flex items-center justify-center
  "
                        >
                          <img
                            src={msg.images[0]}
                            alt="User attachment"
                            className="
        max-w-full       
        max-h-[190px] sm:max-h-[240px]
        h-auto           
        w-auto           
        object-contain   
        rounded-sm
      "
                          />
                        </div>
                      )}
                      <div
                        className={`w-full prose prose-xs sm:prose-sm prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-headings:my-2 prose-pre:!m-0 prose-pre:!p-0 prose-pre:!bg-transparent prose-code:font-mono prose-code:text-purple-300 prose-code:px-[0.4em] prose-code:py-[0.2em] prose-code:bg-gray-700/50 prose-code:rounded-[0.2em] prose-code:text-xs`}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{ code: CodeBlock }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex justify-start animate-fadeInEnhanced my-1">
                  {" "}
                  {/* Aligns with message bubbles */}
                  <div className="max-w-xs lg:max-w-md px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-lg bg-gray-800 text-slate-200 rounded-bl-none flex items-center space-x-2">
                    {/* Your SVG with animation and styling */}
                    <svg
                      version="1.0"
                      xmlns="http://www.w3.org/2000/svg"
                      width="24px"
                      height="24px"
                      viewBox="0 0 360.000000 360.000000"
                      preserveAspectRatio="xMidYMid meet"
                      className="animate-spin fill-slate-300 w-5 h-5 sm:w-6 sm:h-6" // animate-spin and size classes
                    >
                      <g
                        transform="translate(0.000000,360.000000) scale(0.100000,-0.100000)"
                        stroke="none"
                        // fill is now controlled by Tailwind class on <svg>
                      >
                        <path d="M1644 3343 c4 -54 9 -118 11 -143 3 -35 1 -31 -10 20 -8 36 -14 88 -15 115 -1 76 -8 95 -37 95 -23 0 -25 -3 -18 -32 12 -62 28 -709 17 -720 -7 -7 -11 87 -14 299 -4 254 -8 320 -23 376 -9 37 -23 67 -29 67 -63 0 -360 -122 -372 -153 -5 -13 16 -336 32 -492 4 -40 3 -57 -4 -50 -9 9 -25 162 -48 443 -4 45 -9 82 -11 82 -3 0 -31 -21 -64 -46 -58 -46 -59 -48 -59 -98 0 -28 4 -89 10 -135 5 -46 12 -142 14 -215 l6 -131 -25 170 c-13 94 -24 205 -25 248 0 42 -4 77 -8 77 -15 0 -109 -123 -145 -190 -20 -36 -48 -96 -63 -135 -22 -59 -25 -80 -20 -134 5 -56 12 -74 57 -140 50 -75 51 -77 47 -139 -4 -60 -11 -74 -43 -85 -6 -2 -2 -62 13 -163 30 -215 27 -221 -13 -22 -19 93 -37 172 -40 178 -3 5 -13 10 -21 10 -27 0 -91 39 -112 67 -36 50 -43 22 -40 -173 l3 -179 65 -42 c36 -23 73 -50 82 -59 24 -24 57 -114 64 -178 6 -49 4 -57 -19 -80 -14 -14 -36 -26 -48 -26 -11 0 -48 23 -81 50 -50 42 -88 62 -88 47 0 -21 73 -287 88 -320 18 -41 28 -48 130 -101 l111 -56 -4 102 c-4 101 -4 101 6 33 22 -156 17 -146 88 -175 57 -23 64 -29 66 -55 1 -17 5 -38 9 -47 7 -16 2 -18 -33 -18 -53 0 -62 -20 -27 -61 31 -37 32 -39 51 -204 18 -148 41 -245 90 -381 34 -93 104 -238 112 -231 2 2 -3 35 -11 74 -27 128 -39 291 -34 479 4 155 7 188 21 202 15 14 19 15 32 1 19 -19 40 -130 55 -289 10 -103 16 -132 36 -162 18 -29 21 -38 10 -38 -8 0 -17 -4 -20 -9 -9 -14 143 -451 156 -451 2 0 4 94 4 209 2 174 5 214 19 241 15 29 20 32 48 27 124 -23 162 -27 237 -27 47 0 116 7 155 15 92 20 92 20 111 -16 12 -25 17 -76 21 -241 7 -242 -3 -246 99 42 64 182 67 193 50 206 -17 12 -17 14 2 41 13 19 22 53 26 103 21 229 48 360 75 360 29 0 36 -37 39 -230 4 -199 -5 -331 -33 -464 -8 -38 -13 -72 -10 -74 8 -9 86 161 125 275 41 116 71 266 85 413 8 79 15 102 48 137 29 32 16 53 -32 53 -40 0 -40 1 -30 27 5 14 8 35 7 46 -2 16 9 25 61 47 76 30 75 28 91 193 7 65 14 116 16 114 3 -2 0 -60 -5 -128 -5 -68 -7 -126 -5 -128 7 -7 203 91 218 109 17 19 49 118 76 230 11 47 22 95 26 108 10 35 -15 27 -83 -28 -34 -27 -71 -50 -83 -50 -11 0 -33 12 -47 26 -23 23 -25 31 -19 79 7 62 41 157 65 180 9 9 45 35 81 58 l65 42 3 179 c3 198 -3 221 -43 170 -21 -26 -62 -51 -116 -67 -11 -4 -24 -46 -47 -159 -17 -84 -33 -164 -35 -178 l-4 -25 -2 25 c0 14 8 81 19 150 25 161 25 174 -5 204 -21 21 -25 35 -25 80 0 48 5 62 50 128 83 124 80 200 -16 388 -40 78 -137 210 -154 210 -4 0 -10 -57 -14 -127 -4 -71 -15 -182 -26 -248 l-19 -120 5 125 c4 110 13 221 29 357 4 40 3 42 -58 92 -34 28 -65 51 -68 51 -4 0 -9 -42 -13 -92 -12 -168 -37 -422 -41 -427 -9 -9 -5 117 11 317 9 111 13 209 10 217 -12 33 -305 155 -370 155 -7 0 -21 -32 -31 -72 -15 -60 -20 -128 -24 -383 -5 -216 -9 -298 -15 -270 -9 38 8 616 21 698 5 34 3 37 -20 37 -21 0 -25 -5 -31 -46 -3 -26 -6 -65 -7 -88 -1 -23 -5 -52 -10 -66 -5 -16 -7 16 -3 86 6 134 21 124 -180 124 l-138 0 6 -97z m303 -175 c-3 -7 -5 -2 -5 12 0 14 2 19 5 13 2 -7 2 -19 0 -25z m-249 -1118 c0 -85 -3 -166 -7 -180 -11 -36 -21 328 -20 664 l2 291 13 -310 c6 -170 12 -380 12 -465z m226 30 c-7 -225 -9 -238 -17 -165 -6 52 -6 194 2 410 6 182 12 364 14 405 1 41 3 -33 5 -165 2 -132 0 -350 -4 -485z m-320 -78 c-13 -26 -21 160 -14 328 l5 145 8 -228 c5 -125 5 -235 1 -245z m406 83 c-5 -87 -7 -57 -7 140 0 225 1 236 7 110 4 -77 4 -190 0 -250z m537 23 c-3 -8 -6 -5 -6 6 -1 11 2 17 5 13 3 -3 4 -12 1 -19z m-115 -166 c-4 -39 -7 -72 -4 -72 2 0 34 18 70 39 60 35 103 47 155 42 23 -2 23 -56 -3 -152 -60 -228 -89 -319 -107 -345 -11 -15 -49 -44 -84 -64 l-64 -36 -10 -64 -10 -65 -3 58 c-3 63 -13 74 -55 58 -25 -10 -26 -14 -30 -93 l-3 -83 -2 87 c-1 48 -5 89 -9 91 -5 3 -23 8 -40 12 l-33 7 -1 -79 c-1 -43 -4 -116 -8 -163 l-6 -85 -7 65 c-4 36 -3 110 2 165 5 55 6 102 4 105 -3 3 -35 25 -72 50 -36 25 -65 48 -64 53 1 4 2 30 2 59 0 50 2 54 58 108 31 30 109 90 173 132 l116 77 12 89 c6 48 11 100 11 114 0 13 3 28 8 32 11 12 14 -62 4 -142z m-1252 112 c0 -15 5 -67 12 -116 l12 -89 115 -77 c64 -41 142 -101 173 -132 56 -54 58 -58 58 -108 0 -29 1 -55 2 -59 1 -5 -29 -29 -67 -55 -55 -37 -70 -52 -68 -70 8 -118 11 -338 4 -316 -5 15 -12 95 -16 178 -5 101 -11 150 -19 149 -6 -1 -22 -4 -36 -8 -24 -6 -25 -11 -31 -96 l-5 -90 -2 86 -2 87 -31 6 c-17 3 -35 3 -40 0 -5 -3 -10 -31 -10 -62 l-1 -57 -12 65 -11 64 -64 36 c-35 20 -72 49 -84 64 -17 24 -55 145 -113 366 -8 30 -14 71 -14 92 l0 38 53 0 c35 0 63 -7 87 -21 19 -12 50 -30 69 -42 l34 -21 -7 107 c-4 71 -3 107 4 107 5 0 10 -12 10 -26z m-333 -156 c-3 -7 -5 -2 -5 12 0 14 2 19 5 13 2 -7 2 -19 0 -25z m1910 -15 c-3 -10 -5 -2 -5 17 0 19 2 27 5 18 2 -10 2 -26 0 -35z m-1900 -65 c-3 -7 -5 -2 -5 12 0 14 2 19 5 13 2 -7 2 -19 0 -25z m1890 -5 c-3 -10 -5 -4 -5 12 0 17 2 24 5 18 2 -7 2 -21 0 -30z m-1868 -157 c2 -66 -6 -35 -12 49 -4 60 -3 69 3 35 5 -25 9 -63 9 -84z m1856 39 c-4 -42 -10 -74 -12 -71 -3 2 -2 39 2 81 4 42 10 74 12 71 3 -2 2 -39 -2 -81z m-1848 -182 c-3 -10 -5 -2 -5 17 0 19 2 27 5 18 2 -10 2 -26 0 -35z m973 -134 c9 -4 48 -98 88 -210 80 -221 79 -216 28 -298 l-26 -41 -42 21 c-56 29 -160 29 -216 0 l-40 -20 -15 22 c-8 12 -24 41 -35 64 l-22 42 20 63 c11 35 44 128 74 208 51 138 55 146 87 157 33 11 68 8 99 -8z m307 -656 c-3 -10 -5 -4 -5 12 0 17 2 24 5 18 2 -7 2 -21 0 -30z m-730 5 c-3 -8 -6 -5 -6 6 -1 11 2 17 5 13 3 -3 4 -12 1 -19z" />
                      </g>
                    </svg>
                    <span className="text-xs sm:text-sm text-slate-300">
                      EGO is pondering...
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* === MODIFIED "DEEPSEEK STYLE" INPUT AREA FOR REGULAR CHAT === */}
            <div className="px-2 pb-2 pt-1 sm:px-3 sm:pb-3 sm:pt-2">
              <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl p-2 sm:p-2.5 shadow-xl border border-gray-700/50">
                {selectedImagePreview && (
                  <div className="mb-2 p-1.5 border border-gray-600 rounded-lg relative w-20 h-20 sm:w-24 sm:h-24 bg-gray-700/40 mx-auto sm:mx-0">
                    <img
                      src={selectedImagePreview}
                      alt="Selected preview"
                      className="w-full h-full object-contain rounded"
                    />
                    <button
                      type="button"
                      onClick={removeSelectedImage}
                      className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0 w-5 h-5 flex items-center justify-center text-[0.6rem] leading-none shadow-md hover:bg-red-700 z-10"
                      aria-label="Remove image"
                    >
                      &times;
                    </button>
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder={
                      activeChatId
                        ? "Message the AI or attach an image..."
                        : "Select or create a chat"
                    }
                    className="flex-grow w-full p-2 sm:p-2.5 bg-gray-700/60 border border-gray-600 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 focus:outline-none transition-all placeholder-gray-400 text-slate-100 text-sm resize-none overflow-y-auto max-h-24 sm:max-h-32 custom-scrollbar"
                    disabled={
                      isLoading || !activeChatId || ticTacToeState !== null
                    }
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2">
                      {/* Search Button (Dormant) */}
                      <button
                        type="button"
                        className="px-2.5 py-1.5 text-xs sm:text-sm rounded-md bg-gray-700/50 hover:bg-gray-600/50 text-slate-300 transition-colors flex items-center space-x-1 opacity-50 cursor-not-allowed"
                        title="Search (coming soon)"
                        disabled
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>Search</span>
                      </button>
                      {/* Game Dropdown Button */}
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowGameDropdown(!showGameDropdown)}
                          className="px-2.5 py-1.5 text-xs sm:text-sm rounded-md bg-gray-700/50 hover:bg-gray-600/50 text-slate-300 transition-colors flex items-center space-x-1"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="w-4 h-4"
                          >
                            <path d="M7.75 5.25a.75.75 0 0 0-1.5 0v1.5h-1.5a.75.75 0 0 0 0 1.5h1.5v1.5a.75.75 0 0 0 1.5 0v-1.5h1.5a.75.75 0 0 0 0-1.5h-1.5V5.25Z" />
                            <path
                              fillRule="evenodd"
                              d="M9.25 2C6.025 2 3.5 4.05 3.5 6.75v8.5C3.5 17.95 6.025 20 9.25 20s5.75-2.05 5.75-4.75v-8.5C15 4.05 12.475 2 9.25 2ZM5 6.75C5 5.195 6.916 4 9.25 4s4.25 1.195 4.25 2.75v8.5C13.5 16.805 11.584 18 9.25 18S5 16.805 5 15.25v-8.5ZM11.25 8a.75.75 0 0 0-1.5 0v1.5h-1.5a.75.75 0 0 0 0 1.5h1.5V12a.75.75 0 0 0 1.5 0v-1.5h1.5a.75.75 0 0 0 0-1.5h-1.5V8Z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>Game</span>
                        </button>
                        {showGameDropdown && (
                          <div className="absolute bottom-full left-0 mb-1.5 w-48 bg-gray-700/95 backdrop-blur-md border border-gray-600 rounded-lg shadow-2xl py-1 z-20">
                            <button
                              onClick={() => {
                                initiateTicTacToe();
                              }}
                              className="w-full text-left px-3 py-1.5 text-sm text-slate-200 hover:bg-purple-600/70 rounded-md"
                            >
                              Tic-Tac-Toe
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Attach Image Button */}
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageChange}
                        className="hidden"
                        accept="image/png, image/jpeg, image/webp, image/gif"
                      />
                      <button
                        type="button"
                        onClick={triggerImageUpload}
                        className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-slate-300 transition-colors"
                        aria-label="Attach image"
                        title="Attach image"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            fillRule="evenodd"
                            d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.53 9.53l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.452a1.125 1.125 0 0 0 1.59 1.591l3.455-3.553a3 3 0 0 0 0-4.242Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {/* Send Button */}
                      <button
                        type="submit"
                        disabled={
                          isLoading ||
                          (!input.trim() && !selectedImageFile) ||
                          !activeChatId ||
                          ticTacToeState !== null
                        }
                        className="p-2 sm:p-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold shadow-md focus:outline-none focus:ring-1 focus:ring-purple-400 transition-all active:scale-95 hover:shadow-lg hover:shadow-purple-500/30 flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-5 h-5 text-white"
                        >
                          <path d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z" />
                          <path
                            d="M3.105 3.105a1.5 1.5 0 012.122-.001l7.351 7.351a.75.75 0 010 1.061l-7.35 7.35a1.5 1.5 0 01-2.123-2.122L9.39 10.999 3.105 4.716a1.5 1.5 0 01-.001-1.611z"
                            transform="translate(3 0)"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
