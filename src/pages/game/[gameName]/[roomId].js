import { useEffect, useMemo, useRef, useState } from "react";
import { Manrope, Sora } from "next/font/google";
import { useRouter } from "next/router";
import {
    advanceRoomDealer,
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

function ScoreCard({
    isDealer,
    isSaving,
    onAddScore,
    onOpenCalculator,
    onResetScore,
    player,
    score,
    showCalculatorButton,
}) {
    const [draftScore, setDraftScore] = useState("0");
    const [hasUserEditedScore, setHasUserEditedScore] = useState(false);
    const isVirtual = isVirtualPlayer(player);

    return (
        <article className="relative overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,251,250,0.92))] p-5 shadow-[0_28px_60px_-36px_rgba(8,27,71,0.42)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(255,211,179,0.48),transparent_58%),radial-gradient(circle_at_top_right,rgba(184,236,230,0.42),transparent_52%)]" />

            <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="truncate text-[1.45rem] font-extrabold tracking-[-0.04em] text-[#203456]">
                        {player.display_name}
                    </p>
                    <p className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.24em] text-[#50637f]">
                        {isDealer
                            ? "Current Dealer"
                            : isVirtual
                              ? "Virtual player"
                              : player.role}
                    </p>
                </div>
                <div className="rounded-full bg-[#f7dcca] px-4 py-2 text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#9b5724] shadow-[0_14px_28px_-22px_rgba(155,87,36,0.9)]">
                    {isDealer ? "Dealer" : isVirtual ? "Virtual" : "Player"}
                </div>
            </div>

            <div className="relative mt-6 grid gap-4">
                <div className="rounded-[24px] border border-white/80 bg-white/82 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_36px_-28px_rgba(8,27,71,0.24)]">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#50637f]">
                        Total Score
                    </p>
                    <p className="mt-3 text-5xl font-extrabold tracking-[-0.06em] text-[#081b47]">
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
                    className="h-16 min-w-0 rounded-[20px] border border-[#d6dde7]/80 bg-white/88 px-4 text-center text-4xl font-extrabold tracking-[-0.04em] text-[#081b47] outline-none transition focus:border-[#13aea9] focus:ring-4 focus:ring-[#13aea9]/15"
                    aria-label={`${player.display_name} score to add`}
                />
                <div
                    className={`grid gap-3 ${showCalculatorButton ? "grid-cols-3" : "grid-cols-2"}`}
                >
                    <button
                        type="button"
                        onClick={() => {
                            onResetScore(player.user_id);
                        }}
                        disabled={isSaving}
                        aria-label={`Reset ${player.display_name} score`}
                        className="h-12 rounded-[18px] border border-[#d6dde7]/85 bg-white/92 text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:-translate-y-0.5 hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-60"
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
                        className="h-12 rounded-[18px] bg-[#081b47] text-sm font-extrabold uppercase tracking-[0.18em] text-white shadow-[0_18px_34px_-22px_rgba(8,27,71,0.9)] transition hover:-translate-y-0.5 hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <span className="flex h-full items-center justify-center">
                            <AddIcon />
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
                            className="h-12 rounded-[18px] border border-[#13aea9]/22 bg-[linear-gradient(180deg,#f1fffd,#e1f8f4)] text-sm font-extrabold uppercase tracking-[0.18em] text-[#157d79] shadow-[0_16px_30px_-24px_rgba(19,174,169,0.9)] transition hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#ebfffc,#d8f6f0)] disabled:cursor-not-allowed disabled:opacity-60"
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
    const [calculatorPlayer, setCalculatorPlayer] = useState(null);

    const roomId = typeof router.query.roomId === "string" ? router.query.roomId : "";
    const gameName =
        typeof router.query.gameName === "string"
            ? decodeURIComponent(router.query.gameName)
            : "";
    const gameSlug = toGameSlug(gameName);
    const gameCacheKey = roomId ? `${GAME_CACHE_PREFIX}${roomId}` : "";
    const showCalculatorButton = supportsCalculatorGame(gameSlug);

    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    useEffect(() => {
        roomIdRef.current = roomId;
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
    useEffect(() => {
        if (!roomId) {
            return;
        }

        const cachedScoreboard = readStoredJson(gameCacheKey);

        if (cachedScoreboard?.room?.id === roomId && Array.isArray(cachedScoreboard?.players)) {
            setScoreboard(cachedScoreboard);
            setStatus("");
        }

        let isMounted = true;

        async function loadScoreboard() {
            try {
                const nextScoreboard = await getGameScoreboard(roomId);

                if (!isMounted) {
                    return;
                }

                setScoreboard(nextScoreboard);
                setStatus("");
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setScoreboard(null);
                setStatus(error.message || "Unable to load game.");

                if (error.message === "Room not found.") {
                    clearStoredValue(gameCacheKey);
                }
            }
        }

        void loadScoreboard();

        return () => {
            isMounted = false;
        };
    }, [gameCacheKey, roomId]);

    useEffect(() => {
        if (!gameCacheKey || !scoreboard?.room?.id) {
            return;
        }

        writeStoredJson(gameCacheKey, scoreboard);
    }, [gameCacheKey, scoreboard]);

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
                        clearStoredValue(gameCacheKey);
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
            clearStoredValue(gameCacheKey);
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
                <header className="grid gap-4 border-b border-[#d6dde7] pb-6 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
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

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {scoreboard.players.map((player) => {
                        const score = getScoreForPlayer(scoreboard.scores, player.user_id);

                        return (
                            <ScoreCard
                                key={player.user_id}
                                isDealer={
                                    player.user_id === scoreboard.room.current_dealer_user_id
                                }
                                isSaving={savingUserId === player.user_id}
                                onAddScore={handleSetScore}
                                onOpenCalculator={setCalculatorPlayer}
                                onResetScore={handleResetScore}
                                player={player}
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

                {savingUserId ? (
                    <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-[8px] bg-[#081b47] px-4 py-2 text-sm font-extrabold text-white">
                        Saving score...
                    </p>
                ) : null}
            </div>
        </main>
    );
}
