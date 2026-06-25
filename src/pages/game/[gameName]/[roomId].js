import { useEffect, useMemo, useRef, useState } from "react";
import { Manrope, Sora } from "next/font/google";
import { useRouter } from "next/router";
import {
    advanceRoomDealer,
    clearStoredValuesByPrefix,
    clearStoredValue,
    getCurrentUser,
    getGameScoreboard,
    getSupabaseBrowserClient,
    isVirtualPlayer,
    leaveRoom,
    readStoredJson,
    savePlayerScore,
    subscribeToGame,
    writeStoredJson,
} from "@/lib/supabase-browser";
import { GameCalculator, supportsCalculatorGame } from "@/components/game-calculator";
import { toGameSlug } from "@/lib/game-options";

const headingFont = Sora({
    subsets: ["latin"],
    weight: ["700", "800"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["500", "700", "800"],
});

const GAME_CACHE_PREFIX = "game-scorer.game-cache.";
const GAME_ROUND_PREFIX = "game-scorer.game-round.";
const GAME_SCORE_HISTORY_PREFIX = "game-scorer.score-history.";
const LOBBY_CACHE_PREFIX = "game-scorer.lobby-cache.";
const ROOM_ACTIVE_SYNC_PREFIX = "game-scorer.room-active-sync.";
const LAST_ACTIVE_SYNC_KEY = "game-scorer.last-active-sync";
const BLACK_WITCH_TARGET_SCORE = 1000;
const GAME_STORAGE_PREFIXES = [
    GAME_CACHE_PREFIX,
    GAME_ROUND_PREFIX,
    GAME_SCORE_HISTORY_PREFIX,
    LOBBY_CACHE_PREFIX,
    ROOM_ACTIVE_SYNC_PREFIX,
];

function getScoreForPlayer(scores, userId) {
    return scores.find((score) => score.user_id === userId)?.score || 0;
}

function upsertScore(scores, nextScore) {
    const existingIndex = scores.findIndex(
        (score) => score.user_id === nextScore.user_id,
    );

    if (existingIndex >= 0) {
        const nextScores = [...scores];
        nextScores[existingIndex] = nextScore;
        return nextScores;
    }

    return [...scores, nextScore];
}

function upsertPlayer(players, nextPlayer) {
    if (nextPlayer.is_active === false) {
        return players.filter((player) => player.user_id !== nextPlayer.user_id);
    }

    const existingIndex = players.findIndex(
        (player) => player.user_id === nextPlayer.user_id,
    );

    if (existingIndex >= 0) {
        const nextPlayers = [...players];
        nextPlayers[existingIndex] = nextPlayer;
        return nextPlayers;
    }

    return [...players, nextPlayer];
}

function removePlayerByUserId(players, userId) {
    if (!userId) {
        return players;
    }

    return players.filter((player) => player.user_id !== userId);
}

function parseScoreDelta(value) {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
        return 0;
    }

    const nextScore = Number(trimmedValue);

    if (!Number.isFinite(nextScore)) {
        return null;
    }

    return nextScore;
}

function getRoundStorageKey(roomId) {
    return roomId ? `${GAME_ROUND_PREFIX}${roomId}` : "";
}

function readStoredRound(roomId) {
    const storedValue = Number(readStoredJson(getRoundStorageKey(roomId)));

    if (!Number.isInteger(storedValue) || storedValue < 1) {
        return 1;
    }

    return storedValue;
}

function writeStoredRound(roomId, round) {
    const nextRound = Number(round);

    if (!roomId || !Number.isInteger(nextRound) || nextRound < 1) {
        return;
    }

    writeStoredJson(getRoundStorageKey(roomId), nextRound);
}

function getScoreHistoryStorageKey(roomId) {
    return roomId ? `${GAME_SCORE_HISTORY_PREFIX}${roomId}` : "";
}

function readStoredScoreHistory(roomId) {
    const storedValue = readStoredJson(getScoreHistoryStorageKey(roomId));

    if (!storedValue || typeof storedValue !== "object" || Array.isArray(storedValue)) {
        return {};
    }

    return storedValue;
}

function writeStoredScoreHistory(roomId, scoreHistory) {
    if (!roomId || !scoreHistory || typeof scoreHistory !== "object") {
        return;
    }

    writeStoredJson(getScoreHistoryStorageKey(roomId), scoreHistory);
}

function clearGameRoomStorage(roomId) {
    if (!roomId) {
        return;
    }

    clearStoredValue(`${GAME_CACHE_PREFIX}${roomId}`);
    clearStoredValue(getRoundStorageKey(roomId));
    clearStoredValue(getScoreHistoryStorageKey(roomId));
}

function cleanupGameRoomStorage(roomId) {
    const keepKeys = roomId
        ? [
              `${GAME_CACHE_PREFIX}${roomId}`,
              getRoundStorageKey(roomId),
              getScoreHistoryStorageKey(roomId),
          ]
        : [];

    clearStoredValuesByPrefix(GAME_STORAGE_PREFIXES, { keepKeys });
    clearStoredValue(LAST_ACTIVE_SYNC_KEY);
}

function clampProgress(value) {
    return Math.max(0, Math.min(100, value));
}

function getPlacementRibbon(rank) {
    if (rank === 1) {
        return {
            fill: "url(#placement-ribbon-gold)",
            shadow: "drop-shadow(0 14px 20px rgba(217,163,33,0.5))",
        };
    }

    if (rank === 2) {
        return {
            fill: "url(#placement-ribbon-silver)",
            shadow: "drop-shadow(0 14px 20px rgba(125,143,166,0.45))",
        };
    }

    if (rank === 3) {
        return {
            fill: "url(#placement-ribbon-bronze)",
            shadow: "drop-shadow(0 14px 20px rgba(183,106,55,0.5))",
        };
    }

    return null;
}

function RefreshIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path
                d="M20 4v5h-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function CalculatorIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <rect x="4.5" y="3.5" width="15" height="17" rx="3.5" fill="#13AEA9" opacity="0.14" />
            <rect x="7.5" y="6.5" width="9" height="3" rx="1.5" fill="#157D79" />
            <circle cx="9" cy="13" r="1.2" fill="#157D79" />
            <circle cx="12" cy="13" r="1.2" fill="#157D79" />
            <circle cx="15" cy="13" r="1.2" fill="#157D79" />
            <circle cx="9" cy="16.5" r="1.2" fill="#157D79" />
            <circle cx="12" cy="16.5" r="1.2" fill="#157D79" />
            <circle cx="15" cy="16.5" r="1.2" fill="#157D79" />
        </svg>
    );
}

function ResetIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M7 7V3.5M7 3.5H3.5M7 3.5L4.5 6"
                stroke="#50637F"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M7.5 6.5C8.7 5.55 10.2 5 11.85 5C15.8 5 19 8.2 19 12.15C19 16.1 15.8 19.3 11.85 19.3C8.65 19.3 5.95 17.2 5.05 14.3"
                stroke="#50637F"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function AddIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="12" cy="12" r="8.5" fill="rgba(255,255,255,0.12)" />
            <path
                d="M12 8V16M8 12H16"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function HistoryIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M6.5 5.5V3.5M17.5 5.5V3.5M5 9H19M7 13H11M7 16H15M6 5.5H18C18.8284 5.5 19.5 6.17157 19.5 7V18C19.5 18.8284 18.8284 19.5 18 19.5H6C5.17157 19.5 4.5 18.8284 4.5 18V7C4.5 6.17157 5.17157 5.5 6 5.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function ScoreCard({
    isDealer,
    isSaving,
    onAddScore,
    onOpenHistory,
    onOpenCalculator,
    onResetScore,
    player,
    placementRank,
    score,
    showCalculatorButton,
}) {
    const [draftScore, setDraftScore] = useState("0");
    const [hasUserEditedScore, setHasUserEditedScore] = useState(false);
    const isVirtual = isVirtualPlayer(player);
    const placementRibbon = getPlacementRibbon(placementRank);

    return (
        <article className="relative overflow-hidden rounded-[22px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,250,0.92))] p-3 shadow-[0_28px_60px_-36px_rgba(8,27,71,0.42)] sm:rounded-[28px] sm:p-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(255,211,179,0.48),transparent_58%),radial-gradient(circle_at_top_right,rgba(184,236,230,0.42),transparent_52%)]" />
            {placementRibbon ? (
                <svg
                    aria-hidden="true"
                    viewBox="0 0 56 84"
                    className="absolute right-2 top-0 z-10 h-18 w-12 sm:right-4 sm:h-22 sm:w-14"
                    style={{ filter: placementRibbon.shadow }}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <defs>
                        <linearGradient id="placement-ribbon-gold" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#fff0a6" />
                            <stop offset="55%" stopColor="#efc94c" />
                            <stop offset="100%" stopColor="#c68a16" />
                        </linearGradient>
                        <linearGradient id="placement-ribbon-silver" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="55%" stopColor="#cfd8e4" />
                            <stop offset="100%" stopColor="#92a0b3" />
                        </linearGradient>
                        <linearGradient id="placement-ribbon-bronze" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f2d0b5" />
                            <stop offset="55%" stopColor="#cf8753" />
                            <stop offset="100%" stopColor="#995126" />
                        </linearGradient>
                    </defs>
                    <path
                        d="M4 0H52V56L40 50L28 72L16 50L4 56V0Z"
                        fill={placementRibbon.fill}
                    />
                    <path
                        d="M28 72L22 62H34L28 72Z"
                        fill="rgba(8,27,71,0.18)"
                    />
                    <path
                        d="M4 0H52"
                        stroke="rgba(255,255,255,0.52)"
                        strokeWidth="3"
                        strokeLinecap="round"
                    />
                    <path
                        d="M12 10H44"
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            ) : null}

            <div className="relative flex items-start justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                    <p className="truncate text-lg font-extrabold tracking-[-0.04em] text-[#203456] sm:text-[1.45rem]">
                        {player.display_name}
                    </p>
                    <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#50637f] sm:mt-2 sm:text-[11px] sm:tracking-[0.24em]">
                        {isDealer
                            ? "Current Dealer"
                            : isVirtual
                              ? "Virtual player"
                              : player.role}
                    </p>
                </div>
            </div>

            <div className="relative mt-4 grid gap-3 sm:mt-6 sm:gap-4">
                <div className="rounded-[18px] border border-white/80 bg-white/82 px-3 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_36px_-28px_rgba(8,27,71,0.24)] sm:rounded-[24px] sm:px-4 sm:py-5">
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#50637f] sm:text-[11px] sm:tracking-[0.28em]">
                        Total Score
                    </p>
                    <p className="mt-2 text-3xl font-extrabold tracking-[-0.06em] text-[#081b47] sm:mt-3 sm:text-5xl">
                        {score}
                    </p>
                </div>
                <input
                    type="text"
                    value={draftScore}
                    onFocus={() => {
                        if (!hasUserEditedScore && draftScore === "0") {
                            setDraftScore("");
                        }
                    }}
                    onChange={(event) => {
                        setHasUserEditedScore(true);
                        setDraftScore(event.target.value);
                    }}
                    placeholder="0"
                    autoComplete="off"
                    className="h-12 min-w-0 rounded-[16px] border border-[#d6dde7]/80 bg-white/88 px-3 text-center text-2xl font-extrabold tracking-[-0.04em] text-[#081b47] outline-none transition focus:border-[#13aea9] focus:ring-4 focus:ring-[#13aea9]/15 sm:h-16 sm:rounded-[20px] sm:px-4 sm:text-4xl"
                    aria-label={`${player.display_name} score to add`}
                />
                <div
                    className={`grid gap-2 sm:gap-3 ${showCalculatorButton ? "grid-cols-4" : "grid-cols-3"}`}
                >
                    <button
                        type="button"
                        onClick={() => {
                            onResetScore(player.user_id);
                        }}
                        disabled={isSaving}
                        aria-label={`Reset ${player.display_name} score`}
                        className="h-10 rounded-[14px] border border-[#d6dde7]/85 bg-white/92 text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:-translate-y-0.5 hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:rounded-[18px]"
                    >
                        <span className="flex h-full items-center justify-center">
                            <ResetIcon />
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const nextScore = parseScoreDelta(draftScore);

                            if (nextScore === null) {
                                return;
                            }

                            onAddScore(player.user_id, nextScore);
                            setDraftScore("0");
                            setHasUserEditedScore(false);
                        }}
                        disabled={isSaving}
                        aria-label={`Add score to ${player.display_name}`}
                        className="h-10 rounded-[14px] bg-[#081b47] text-sm font-extrabold uppercase tracking-[0.18em] text-white shadow-[0_18px_34px_-22px_rgba(8,27,71,0.9)] transition hover:-translate-y-0.5 hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:rounded-[18px]"
                    >
                        <span className="flex h-full items-center justify-center">
                            <AddIcon />
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onOpenHistory(player);
                        }}
                        disabled={isSaving}
                        aria-label={`Open score history for ${player.display_name}`}
                        className="h-10 rounded-[14px] border border-[#d6dde7]/85 bg-white/92 text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:-translate-y-0.5 hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:rounded-[18px]"
                    >
                        <span className="flex h-full items-center justify-center">
                            <HistoryIcon />
                        </span>
                    </button>
                    {showCalculatorButton ? (
                        <button
                            type="button"
                            onClick={() => {
                                onOpenCalculator(player);
                            }}
                            disabled={isSaving}
                            aria-label={`Open calculator for ${player.display_name}`}
                            className="h-10 rounded-[14px] border border-[#13aea9]/22 bg-[linear-gradient(180deg,#f1fffd,#e1f8f4)] text-sm font-extrabold uppercase tracking-[0.18em] text-[#157d79] shadow-[0_16px_30px_-24px_rgba(19,174,169,0.9)] transition hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#ebfffc,#d8f6f0)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:rounded-[18px]"
                        >
                            <span className="flex h-full items-center justify-center">
                                <CalculatorIcon />
                            </span>
                        </button>
                    ) : null}
                </div>
            </div>
        </article>
    );
}

export default function GamePage() {
    const router = useRouter();
    const routerRef = useRef(router);
    const roomIdRef = useRef("");
    const [scoreboard, setScoreboard] = useState(null);
    const [status, setStatus] = useState("Loading game...");
    const [currentUserId, setCurrentUserId] = useState("");
    const [isLeavingGame, setIsLeavingGame] = useState(false);
    const [savingUserId, setSavingUserId] = useState("");
    const [isAdvancingRound, setIsAdvancingRound] = useState(false);
    const [isRefreshingScoreboard, setIsRefreshingScoreboard] = useState(false);
    const [calculatorPlayer, setCalculatorPlayer] = useState(null);
    const [historyPlayer, setHistoryPlayer] = useState(null);
    const [roundNumber, setRoundNumber] = useState(1);
    const [scoreHistory, setScoreHistory] = useState({});

    const roomId = typeof router.query.roomId === "string" ? router.query.roomId : "";
    const gameName =
        typeof router.query.gameName === "string"
            ? decodeURIComponent(router.query.gameName)
            : "";
    const gameSlug = toGameSlug(gameName);
    const gameCacheKey = roomId ? `${GAME_CACHE_PREFIX}${roomId}` : "";
    const showCalculatorButton = supportsCalculatorGame(gameSlug);
    const showBlackWitchStandings =
        gameSlug === "black-witch" || gameSlug === "black-bitch";

    async function refreshScoreboard(options = {}) {
        const targetRoomId = roomIdRef.current || roomId;

        if (!targetRoomId) {
            return;
        }

        const isManual = options.manual === true;

        if (isManual) {
            setIsRefreshingScoreboard(true);
            setStatus("Refreshing scores...");
        }

        try {
            const nextScoreboard = await getGameScoreboard(targetRoomId);

            if (roomIdRef.current !== targetRoomId) {
                return;
            }

            setScoreboard(nextScoreboard);
            setStatus("");
        } catch (error) {
            if (roomIdRef.current !== targetRoomId) {
                return;
            }

            setScoreboard((current) => (isManual ? current : null));
            setStatus(error.message || "Unable to load game.");

            if (error.message === "Room not found.") {
                clearGameRoomStorage(targetRoomId);
            }
        } finally {
            if (isManual) {
                setIsRefreshingScoreboard(false);
            }
        }
    }

    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    useEffect(() => {
        cleanupGameRoomStorage(roomId);
        setRoundNumber(readStoredRound(roomId));
        setScoreHistory(readStoredScoreHistory(roomId));
    }, [roomId]);

    useEffect(() => {
        let isMounted = true;
        const client = getSupabaseBrowserClient();

        async function loadCurrentUser() {
            try {
                const user = await getCurrentUser();

                if (isMounted) {
                    setCurrentUserId(user?.id || "");
                }
            } catch {
                if (isMounted) {
                    setCurrentUserId("");
                }
            }
        }

        void loadCurrentUser();

        const {
            data: { subscription },
        } = client.auth.onAuthStateChange((_event, session) => {
            if (!isMounted) {
                return;
            }

            setCurrentUserId(session?.user?.id || "");
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const currentDealer = useMemo(() => {
        if (!scoreboard?.room?.current_dealer_user_id) {
            return null;
        }

        return scoreboard.players.find(
            (player) => player.user_id === scoreboard.room.current_dealer_user_id,
        );
    }, [scoreboard]);

    const sortedPlayerStandings = useMemo(() => {
        if (!scoreboard?.players?.length) {
            return [];
        }

        return [...scoreboard.players]
            .map((player) => {
                const score = getScoreForPlayer(scoreboard.scores || [], player.user_id);

                return {
                    ...player,
                    score,
                    progress: clampProgress(
                        (score / BLACK_WITCH_TARGET_SCORE) * 100,
                    ),
                };
            })
            .sort((leftPlayer, rightPlayer) => {
                if (rightPlayer.score !== leftPlayer.score) {
                    return rightPlayer.score - leftPlayer.score;
                }

                return leftPlayer.display_name.localeCompare(
                    rightPlayer.display_name,
                );
            });
    }, [scoreboard]);

    const displayedPlayers =
        showBlackWitchStandings && sortedPlayerStandings.length
            ? sortedPlayerStandings
            : scoreboard?.players || [];

    const playerPlacementRanks = useMemo(() => {
        const rankedPlayers = [...(scoreboard?.players || [])]
            .map((player) => ({
                userId: player.user_id,
                score: getScoreForPlayer(scoreboard?.scores || [], player.user_id),
                displayName: player.display_name,
            }))
            .sort((leftPlayer, rightPlayer) => {
                if (rightPlayer.score !== leftPlayer.score) {
                    return rightPlayer.score - leftPlayer.score;
                }

                return leftPlayer.displayName.localeCompare(rightPlayer.displayName);
            });

        return new Map(
            rankedPlayers
                .slice(0, 3)
                .map((player, index) => [player.userId, index + 1]),
        );
    }, [scoreboard]);

    const selectedPlayerHistory = useMemo(() => {
        if (!historyPlayer?.user_id) {
            return [];
        }

        const entries = scoreHistory[historyPlayer.user_id];

        if (!Array.isArray(entries)) {
            return [];
        }

        return entries.map((entry, index) => {
            const previousTotal = index > 0 ? Number(entries[index - 1]?.totalScore || 0) : 0;
            const totalScore = Number(entry?.totalScore || 0);

            return {
                round: Number(entry?.round || index + 1),
                totalScore,
                addedScore: totalScore - previousTotal,
            };
        });
    }, [historyPlayer, scoreHistory]);

    useEffect(() => {
        if (!roomId) {
            return;
        }

        const cachedScoreboard = readStoredJson(gameCacheKey);

        if (cachedScoreboard?.room?.id === roomId && Array.isArray(cachedScoreboard?.players)) {
            setScoreboard(cachedScoreboard);
            setStatus("");
        }

        async function loadScoreboard() {
            await refreshScoreboard();
        }

        void loadScoreboard();
    }, [gameCacheKey, roomId]);

    useEffect(() => {
        if (!gameCacheKey || !scoreboard?.room?.id) {
            return;
        }

        writeStoredJson(gameCacheKey, scoreboard);
    }, [gameCacheKey, scoreboard]);

    useEffect(() => {
        writeStoredRound(roomId, roundNumber);
    }, [roomId, roundNumber]);

    useEffect(() => {
        writeStoredScoreHistory(roomId, scoreHistory);
    }, [roomId, scoreHistory]);

    useEffect(() => {
        if (!roomId) {
            return undefined;
        }

        return subscribeToGame(
            roomId,
            (payload) => {
                setScoreboard((current) => {
                    if (!current) {
                        return current;
                    }

                    if (
                        payload.sourceTable === "rooms" &&
                        payload.eventType === "DELETE"
                    ) {
                        clearGameRoomStorage(roomId);
                        void routerRef.current.replace("/");
                        return null;
                    }

                    if (payload.sourceTable === "rooms" && payload.new) {
                        return {
                            ...current,
                            room: payload.new,
                        };
                    }

                    if (
                        payload.sourceTable === "room_players" &&
                        payload.eventType === "DELETE"
                    ) {
                        if (!payload.old?.user_id) {
                            return current;
                        }

                        return {
                            ...current,
                            players: removePlayerByUserId(
                                current.players,
                                payload.old?.user_id,
                            ),
                        };
                    }

                    if (payload.sourceTable === "room_players" && payload.new) {
                        return {
                            ...current,
                            players: upsertPlayer(current.players, payload.new),
                        };
                    }

                    if (payload.sourceTable === "game_scores" && payload.new) {
                        return {
                            ...current,
                            scores: upsertScore(current.scores, payload.new),
                        };
                    }

                    return current;
                });
            },
            (subscriptionStatus) => {
                if (subscriptionStatus === "CHANNEL_ERROR") {
                    setStatus("Realtime score updates disconnected.");
                    return;
                }

                if (subscriptionStatus === "TIMED_OUT") {
                    setStatus("Realtime score updates timed out.");
                    return;
                }

                if (subscriptionStatus === "CLOSED") {
                    setStatus("Realtime score updates closed.");
                    return;
                }

                if (subscriptionStatus === "SUBSCRIBED") {
                    setStatus("");
                }
            },
        );
    }, [gameCacheKey, roomId]);

    async function persistScore(playerUserId, nextScore) {
        if (!scoreboard?.room?.id) {
            return;
        }

        setSavingUserId(playerUserId);
        const previousScoreboard = scoreboard;

        const optimisticScore = {
            room_id: scoreboard.room.id,
            user_id: playerUserId,
            score: Math.trunc(Number(nextScore) || 0),
            updated_at: new Date().toISOString(),
        };

        setScoreboard((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                scores: upsertScore(current.scores, optimisticScore),
            };
        });

        try {
            const savedScore = await savePlayerScore(
                scoreboard.room.id,
                playerUserId,
                nextScore,
            );

            setScoreboard((current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    scores: upsertScore(current.scores, savedScore),
                };
            });
            setStatus("");
        } catch (error) {
            setScoreboard(previousScoreboard);
            setStatus(error.message || "Unable to save score.");
        } finally {
            setSavingUserId("");
        }
    }

    function handleSetScore(playerUserId, nextScore) {
        const currentScore = getScoreForPlayer(scoreboard?.scores || [], playerUserId);
        void persistScore(playerUserId, currentScore + Number(nextScore || 0));
    }

    function handleResetScore(playerUserId) {
        void persistScore(playerUserId, 0);
    }

    function handleCalculatorAdd(playerUserId, calculatedScore) {
        void handleSetScore(playerUserId, calculatedScore);
        setCalculatorPlayer(null);
    }

    async function handleNextRound() {
        if (!scoreboard?.room?.room_code) {
            return;
        }

        setIsAdvancingRound(true);

        try {
            const roundHistorySnapshot = {};

            for (const player of scoreboard.players || []) {
                roundHistorySnapshot[player.user_id] = Math.trunc(
                    Number(
                        getScoreForPlayer(scoreboard.scores || [], player.user_id),
                    ) || 0,
                );
            }

            const nextRoom = await advanceRoomDealer(scoreboard.room.room_code);

            setScoreboard((current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    room: nextRoom,
                };
            });
            setScoreHistory((current) => {
                const nextHistory = { ...current };

                for (const [playerUserId, totalScore] of Object.entries(
                    roundHistorySnapshot,
                )) {
                    const existingEntries = Array.isArray(nextHistory[playerUserId])
                        ? nextHistory[playerUserId]
                        : [];

                    nextHistory[playerUserId] = [
                        ...existingEntries,
                        {
                            round: roundNumber,
                            totalScore,
                        },
                    ];
                }

                return nextHistory;
            });
            setRoundNumber((current) => current + 1);
            setStatus("");
        } catch (error) {
            setStatus(error.message || "Unable to move to the next round.");
        } finally {
            setIsAdvancingRound(false);
        }
    }

    async function handleLeaveGame() {
        if (!scoreboard?.room?.room_code) {
            return;
        }

        setIsLeavingGame(true);

        try {
            await leaveRoom(scoreboard.room.room_code);
            clearGameRoomStorage(roomId);
            await routerRef.current.replace("/");
        } catch (error) {
            setStatus(error.message || "Unable to leave game.");
            setIsLeavingGame(false);
        }
    }

    if (!scoreboard) {
        return (
            <main
                className={`${bodyFont.className} relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef5f3] px-6 text-center text-[#081b47]`}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
                <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
                <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
                <div className="relative space-y-3">
                    <h1 className={`${headingFont.className} text-4xl font-extrabold`}>
                        {gameName || "Game"}
                    </h1>
                    <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                        {status}
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] px-4 py-6 text-[#081b47] sm:px-8`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
            <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 mb-10">
                <header className="grid gap-4 border-b border-[#d6dde7] pb-6 xl:grid-cols-[1fr_auto_auto_auto_auto] xl:items-end">
                    <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#b5672f]">
                            Room {scoreboard.room.room_code}
                        </p>
                        <h1
                            className={`${headingFont.className} mt-2 text-4xl font-extrabold text-[#081b47] sm:text-5xl`}
                        >
                            {scoreboard.room.selected_game}
                        </h1>
                    </div>
                    <div className="rounded-[8px] border border-[#d6dde7] bg-white px-4 py-3">
                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                            Current Dealer
                        </p>
                        <p className="mt-1 text-xl font-extrabold text-[#203456]">
                            {currentDealer?.display_name || "Not set"}
                        </p>
                    </div>
                    <div className="rounded-[8px] border border-[#d6dde7] bg-white px-4 py-3">
                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                            Round
                        </p>
                        <p className="mt-1 text-xl font-extrabold text-[#203456]">
                            {roundNumber}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleNextRound}
                        disabled={isAdvancingRound}
                        className="h-14 rounded-[8px] bg-[#081b47] px-5 text-sm font-extrabold uppercase tracking-[0.16em] text-white transition hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isAdvancingRound ? "Advancing..." : "Next Round"}
                    </button>
                    <button
                        type="button"
                        onClick={handleLeaveGame}
                        disabled={isLeavingGame}
                        className="h-14 rounded-[8px] border border-[#d6dde7] bg-white px-5 text-sm font-extrabold uppercase tracking-[0.16em] text-[#50637f] transition hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLeavingGame ? "Leaving..." : "Leave Game"}
                    </button>
                </header>

                {status ? (
                    <p className="rounded-[8px] bg-[#f7dcca] px-4 py-3 text-sm font-extrabold text-[#9b5724]">
                        {status}
                    </p>
                ) : null}

                {showBlackWitchStandings ? (
                    <section className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_55px_-30px_rgba(8,27,71,0.28)] backdrop-blur-xl sm:p-6">
                        <div className="flex flex-col gap-2 border-b border-[#d6dde7] pb-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#b5672f]">
                                    Race To 1000
                                </p>
                                <h2
                                    className={`${headingFont.className} mt-2 text-2xl font-extrabold text-[#081b47] sm:text-3xl`}
                                >
                                    Black Witch
                                </h2>
                            </div>
                        </div>
                        <div className="mt-5 grid gap-4">
                            {sortedPlayerStandings.map((player, index) => (
                                <article
                                    key={`standing-${player.user_id}`}
                                    className="rounded-[22px] border border-[#dfe7ef] bg-[linear-gradient(180deg,#ffffff,#f8fbfc)] px-4 py-4 shadow-[0_18px_42px_-34px_rgba(8,27,71,0.35)]"
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#081b47] text-sm font-extrabold text-white">
                                                    {index + 1}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-lg font-extrabold tracking-[-0.03em] text-[#203456]">
                                                        {player.display_name}
                                                    </p>
                                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#50637f]">
                                                        {player.score} / {BLACK_WITCH_TARGET_SCORE}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="shrink-0 text-2xl font-extrabold tracking-[-0.05em] text-[#081b47]">
                                            {Math.round(player.progress)}%
                                        </p>
                                    </div>
                                    <div className="relative mt-4 h-4 overflow-hidden rounded-full bg-[#e4ebf3]">
                                        <div
                                            className="score-progress-fill relative h-full rounded-full bg-[linear-gradient(90deg,#13aea9,#081b47)] transition-[width] duration-500 ease-out"
                                            style={{ width: `${player.progress}%` }}
                                        >
                                            {player.progress > 0 ? (
                                                <>
                                                    <span className="score-progress-ash" />
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                    {displayedPlayers.map((player) => {
                        const score = getScoreForPlayer(scoreboard.scores, player.user_id);

                        return (
                            <ScoreCard
                                key={player.user_id}
                                isDealer={
                                    player.user_id === scoreboard.room.current_dealer_user_id
                                }
                                isSaving={savingUserId === player.user_id}
                                onAddScore={handleSetScore}
                                onOpenHistory={setHistoryPlayer}
                                onOpenCalculator={setCalculatorPlayer}
                                onResetScore={handleResetScore}
                                player={player}
                                placementRank={playerPlacementRanks.get(player.user_id)}
                                score={score}
                                showCalculatorButton={showCalculatorButton}
                            />
                        );
                    })}
                </section>

                {calculatorPlayer ? (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#081b47]/38 px-4 py-6 backdrop-blur-sm">
                        <div className="mx-auto w-full max-w-7xl">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="rounded-full bg-white/82 px-5 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#081b47] shadow-[0_20px_45px_-32px_rgba(11,31,73,0.35)]">
                                    Calculator for {calculatorPlayer.display_name}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setCalculatorPlayer(null)}
                                    className="rounded-full bg-[#081b47] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                                >
                                    Close Calculator
                                </button>
                            </div>
                            <div className="rounded-[32px]">
                                <GameCalculator
                                    gameName={gameSlug}
                                    hideBackLink
                                    onApplyScore={(calculatedScore) =>
                                        handleCalculatorAdd(
                                            calculatorPlayer.user_id,
                                            calculatedScore,
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                ) : null}

                {historyPlayer ? (
                    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#081b47]/38 px-4 py-6 backdrop-blur-sm">
                        <div className="mx-auto w-full max-w-2xl rounded-[30px] border border-white/65 bg-white/92 p-5 shadow-[0_28px_80px_-34px_rgba(8,27,71,0.48)] sm:p-6">
                            <div className="flex items-start justify-between gap-4 border-b border-[#d6dde7] pb-4">
                                <div>
                                    <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#b5672f]">
                                        Score History
                                    </p>
                                    <h2
                                        className={`${headingFont.className} mt-2 text-2xl font-extrabold text-[#081b47]`}
                                    >
                                        {historyPlayer.display_name}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setHistoryPlayer(null)}
                                    className="rounded-full bg-[#081b47] px-4 py-2 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                                >
                                    Close
                                </button>
                            </div>
                            <div className="mt-5 grid gap-3">
                                {selectedPlayerHistory.length ? (
                                    selectedPlayerHistory
                                        .slice()
                                        .reverse()
                                        .map((entry) => (
                                            <article
                                                key={`${historyPlayer.user_id}-round-${entry.round}`}
                                                className="flex items-center justify-between gap-4 rounded-[22px] border border-[#dfe7ef] bg-[linear-gradient(180deg,#ffffff,#f8fbfc)] px-4 py-4 shadow-[0_18px_42px_-34px_rgba(8,27,71,0.2)]"
                                            >
                                                <div>
                                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#50637f]">
                                                        Round {entry.round}
                                                    </p>
                                                    <p className="mt-1 text-sm font-bold text-[#50637f]">
                                                        Total: {entry.totalScore}
                                                    </p>
                                                </div>
                                                <p className="text-2xl font-extrabold tracking-[-0.05em] text-[#081b47]">
                                                    +{entry.addedScore}
                                                </p>
                                            </article>
                                        ))
                                ) : (
                                    <div className="rounded-[22px] border border-dashed border-[#d6dde7] bg-[#fbfcfd] px-4 py-8 text-center text-sm font-bold text-[#50637f]">
                                        No completed rounds recorded yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}

                {savingUserId ? (
                    <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-[8px] bg-[#081b47] px-4 py-2 text-sm font-extrabold text-white">
                        Saving score...
                    </p>
                ) : null}

                <button
                    type="button"
                    onClick={() => void refreshScoreboard({ manual: true })}
                    disabled={isRefreshingScoreboard}
                    aria-label="Refresh scores from database"
                    className="fixed bottom-14 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#081b47] text-white shadow-[0_24px_48px_-20px_rgba(8,27,71,0.9)] transition hover:-translate-y-0.5 hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60 sm:h-14 sm:w-14"
                >
                    <RefreshIcon />
                </button>
            </div>
        </main>
    );
}
