import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Manrope, Sora } from "next/font/google";
import { useRouter } from "next/router";
import {
    addVirtualPlayerToRoom,
    clearStoredValue,
    createRoom,
    formatRoomCode,
    getCurrentUser,
    getActiveRoomForCurrentUser,
    getLobbyByCode,
    isVirtualPlayer,
    kickPlayerFromRoom,
    leaveRoom,
    readStoredJson,
    saveRoomDealerOrder,
    subscribeToRoom,
    syncRoomPlayerActivity,
    writeStoredJson,
} from "@/lib/supabase-browser";
import { GAME_OPTIONS } from "@/lib/game-options";

const headingFont = Sora({
    subsets: ["latin"],
    weight: ["700", "800"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["500", "700", "800"],
});

const LOBBY_CACHE_PREFIX = "game-scorer.lobby-cache.";

function GameCard({
    imageSrc,
    imageAlt,
    title,
    description,
    onClick,
    disabled,
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="overflow-hidden rounded-[32px] bg-[#081018] text-left text-white shadow-[0_28px_60px_-28px_rgba(8,16,24,0.9)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
            <div className="relative aspect-[4/5] w-full">
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    fill
                    priority
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#081018] via-[#081018]/30 to-transparent" />
            </div>
            <div className="space-y-3 p-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-white/55">
                    Game Type
                </p>
                <h2
                    className={`${headingFont.className} text-3xl font-extrabold tracking-[-0.05em]`}
                >
                    {title}
                </h2>
                <p className="text-sm font-bold leading-6 text-white/72">{description}</p>
            </div>
        </button>
    );
}

function getInitials(name) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}

function PlayerCard({ player, isCurrentHost }) {
    const isVirtual = isVirtualPlayer(player);

    return (
        <article
            className={`relative rounded-[26px] border bg-white p-6 shadow-[0_18px_45px_-28px_rgba(8,27,71,0.35)] ${isCurrentHost ? "border-[#d98d4c] shadow-[0_18px_45px_-28px_rgba(217,141,76,0.55)]" : "border-[#e9eef3]"}`}
        >
            {player.role === "host" ? (
                <span className="absolute right-4 top-0 -translate-y-1/2 rounded-full bg-[#b5672f] px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-white">
                    Host
                </span>
            ) : null}
            <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-18 w-18 items-center justify-center rounded-full bg-[#081b47] text-xl font-extrabold text-white">
                    {getInitials(player.display_name)}
                </div>
                <div className="space-y-1">
                    <h3 className="text-2xl font-extrabold tracking-[-0.03em] text-[#203456]">
                        {player.display_name}
                    </h3>
                    <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#1b5e58]">
                        {isVirtual
                            ? "Virtual player"
                            : isCurrentHost
                              ? "Ready to play"
                              : "Ready"}
                    </p>
                </div>
            </div>
        </article>
    );
}

function WaitingCard() {
    return (
        <article className="rounded-[26px] border border-dashed border-[#cfd8e4] bg-[#f7f9fb] p-6 text-center text-[#8a98ad]">
            <div className="flex min-h-52 flex-col items-center justify-center gap-4">
                <div className="flex h-18 w-18 items-center justify-center rounded-full bg-white text-3xl font-light">
                    +
                </div>
                <p className="text-sm font-extrabold uppercase tracking-[0.18em]">
                    Waiting for players
                </p>
            </div>
        </article>
    );
}

function moveItem(items, fromIndex, toIndex) {
    if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= items.length ||
        toIndex >= items.length ||
        fromIndex === toIndex
    ) {
        return items;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(fromIndex, 1);
    nextItems.splice(toIndex, 0, movedItem);
    return nextItems;
}

function buildDealerOrder(players, previousOrder = []) {
    const playerIds = new Set(players.map((player) => player.user_id));
    const preservedOrder = previousOrder.filter((userId) => playerIds.has(userId));
    const orderedPlayers = [...players].sort(
        (leftPlayer, rightPlayer) =>
            new Date(leftPlayer.joined_at).getTime() -
            new Date(rightPlayer.joined_at).getTime(),
    );

    orderedPlayers.forEach((player) => {
        if (!preservedOrder.includes(player.user_id)) {
            preservedOrder.push(player.user_id);
        }
    });

    return preservedOrder;
}

function ManagePlayersModal({
    isOpen,
    isHost,
    players,
    isAddingVirtualPlayer,
    kickingPlayerId,
    onAddVirtualPlayer,
    onClose,
    onKickPlayer,
}) {
    const [virtualPlayerName, setVirtualPlayerName] = useState("");

    if (!isOpen || !isHost) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#081018]/55 px-4 py-8 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-players-title"
        >
            <div className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-[0_28px_80px_-34px_rgba(8,27,71,0.48)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-[#b5672f]">
                            Lobby Controls
                        </p>
                        <h2
                            id="manage-players-title"
                            className={`${headingFont.className} text-3xl font-extrabold tracking-[-0.05em] text-[#081b47]`}
                        >
                            Manage players
                        </h2>
                        <p className="text-sm font-bold text-[#50637f]">
                            Hosts can remove players from the room in real time.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-[#d6dde7] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:bg-[#f7f9fb]"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-6 space-y-3">
                    <div className="rounded-[22px] border border-dashed border-[#d6dde7] bg-[#fbfcfd] px-4 py-4">
                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                            Add virtual player
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                                type="text"
                                autoComplete="off"
                                value={virtualPlayerName}
                                onChange={(event) => setVirtualPlayerName(event.target.value)}
                                placeholder="Player name"
                                className="h-12 flex-1 rounded-[16px] border border-[#d6dde7] bg-white px-4 text-base font-bold text-[#203456] outline-none transition placeholder:text-[#8a98ad] focus:border-[#13aea9] focus:ring-4 focus:ring-[#13aea9]/15"
                            />
                            <button
                                type="button"
                                onClick={async () => {
                                    const trimmedName = virtualPlayerName.trim();

                                    if (!trimmedName) {
                                        return;
                                    }

                                    await onAddVirtualPlayer(trimmedName);
                                    setVirtualPlayerName("");
                                }}
                                disabled={isAddingVirtualPlayer}
                                className="rounded-full bg-[#081b47] px-5 py-3 text-xs font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isAddingVirtualPlayer ? "Adding..." : "Add Player"}
                            </button>
                        </div>
                    </div>
                    {players.map((player) => {
                        const isHostPlayer = player.role === "host";
                        const isVirtual = isVirtualPlayer(player);
                        const isKicking = kickingPlayerId === player.user_id;

                        return (
                            <div
                                key={player.id}
                                className="flex items-center justify-between gap-4 rounded-[22px] border border-[#e9eef3] bg-[#fbfcfd] px-4 py-4"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-lg font-extrabold tracking-[-0.03em] text-[#203456]">
                                        {player.display_name}
                                    </p>
                                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                                        {isHostPlayer
                                            ? "Host"
                                            : isVirtual
                                              ? "Virtual player"
                                              : "Player"}
                                    </p>
                                </div>
                                {isHostPlayer ? (
                                    <span className="rounded-full bg-[#f7dcca] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#b5672f]">
                                        Protected
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onKickPlayer(player.user_id)}
                                        disabled={Boolean(kickingPlayerId)}
                                        className="rounded-full bg-[#8f2d2d] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#7d2222] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {isKicking
                                            ? isVirtual
                                                ? "Removing..."
                                                : "Kicking..."
                                            : isVirtual
                                              ? "Remove"
                                              : "Kick"}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function StartGameModal({
    isOpen,
    isHost,
    players,
    dealerOrderUserIds,
    isSaving,
    onClose,
    onMoveDealer,
    onConfirm,
}) {
    if (!isOpen || !isHost) {
        return null;
    }

    const orderedPlayers = dealerOrderUserIds
        .map((userId) => players.find((player) => player.user_id === userId))
        .filter(Boolean);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#081018]/55 px-4 py-8 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-game-title"
        >
            <div className="w-full max-w-3xl rounded-[30px] bg-white p-6 shadow-[0_28px_80px_-34px_rgba(8,27,71,0.48)] sm:p-8">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                        <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-[#b5672f]">
                            Start Game
                        </p>
                        <h2
                            id="start-game-title"
                            className={`${headingFont.className} text-3xl font-extrabold tracking-[-0.05em] text-[#081b47]`}
                        >
                            Set the dealing order
                        </h2>
                        <p className="text-sm font-bold text-[#50637f]">
                            Put each player in dealer order. Everyone will deal once.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-[#d6dde7] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:bg-[#f7f9fb]"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-6 space-y-3">
                    {orderedPlayers.map((player, index) => {
                        const isFirst = index === 0;
                        const isLast = index === orderedPlayers.length - 1;

                        return (
                            <div
                                key={player.user_id}
                                className="flex items-center justify-between gap-4 rounded-[22px] border border-[#e9eef3] bg-[#fbfcfd] px-4 py-4"
                            >
                                <div className="flex min-w-0 items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#081b47] text-sm font-extrabold text-white">
                                        {index + 1}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-lg font-extrabold tracking-[-0.03em] text-[#203456]">
                                            {player.display_name}
                                        </p>
                                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                                            {player.role === "host"
                                                ? "Host"
                                                : isVirtualPlayer(player)
                                                  ? "Virtual player"
                                                  : "Player"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onMoveDealer(index, index - 1)}
                                        disabled={isFirst}
                                        className="rounded-full border border-[#d6dde7] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Up
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onMoveDealer(index, index + 1)}
                                        disabled={isLast}
                                        className="rounded-full border border-[#d6dde7] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Down
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-bold text-[#50637f]">
                        First dealer: {orderedPlayers[0]?.display_name || "Not set"}
                    </p>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isSaving}
                        className="rounded-full bg-[#081b47] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSaving ? "Saving..." : "Confirm Order"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function SelectionView({ hostName, isCreatingRoom, onCreateRoom }) {
    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] px-6 py-10 text-[#081b47] sm:px-10`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
            <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8">
                <header className="flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/70 p-6 shadow-[0_25px_60px_-30px_rgba(11,31,73,0.25)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-extrabold uppercase tracking-[0.32em] text-[#081b47]/45">
                            New Room Lobby
                        </p>
                        <h1
                            className={`${headingFont.className} text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl`}
                        >
                            Pick a game.
                        </h1>
                    </div>
                    <div className="rounded-full bg-[#081b47] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.2em] text-white">
                        {hostName ? `Host: ${hostName}` : "Host"}
                    </div>
                </header>

                <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {GAME_OPTIONS.map((game) => (
                        <GameCard
                            key={game.key}
                            imageSrc={game.imageSrc}
                            imageAlt={game.imageAlt}
                            title={game.key}
                            description={game.description}
                            disabled={isCreatingRoom}
                            onClick={() => onCreateRoom(game.key)}
                        />
                    ))}
                </section>
            </div>
        </main>
    );
}

function RoomView({
    room,
    players,
    currentUserId,
    isCopyingCode,
    onCopyCode,
    onLeaveLobby,
    isLeavingLobby,
    isManagePlayersOpen,
    isAddingVirtualPlayer,
    onOpenManagePlayers,
    onAddVirtualPlayer,
    onCloseManagePlayers,
    onKickPlayer,
    kickingPlayerId,
    isStartGameOpen,
    dealerOrderUserIds,
    isSavingDealerOrder,
    onCloseStartGame,
    onMoveDealer,
    onConfirmDealerOrder,
    onStartGame,
}) {
    const isHost = currentUserId && room.host_user_id === currentUserId;
    const waitingSlots = Math.max(1, 4 - players.length);

    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] px-4 py-6 text-[#081b47] sm:px-6 sm:py-8`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
            <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 mb-10">
                <div className="flex justify-center">
                    <div className="rounded-full bg-[#f7dcca] px-5 py-3 text-xs font-extrabold uppercase tracking-[0.22em] text-[#b5672f]">
                        Playing: {room.selected_game}
                    </div>
                </div>

                <section className="mx-auto w-full max-w-xl rounded-[28px] bg-white px-6 py-8 text-center shadow-[0_24px_55px_-30px_rgba(11,31,73,0.32)]">
                    <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#50637f]">
                        Room Code
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-3">
                        <h1
                            className={`${headingFont.className} text-5xl font-extrabold tracking-[0.22em] text-[#081b47] sm:text-6xl`}
                        >
                            {room.room_code}
                        </h1>
                        <button
                            type="button"
                            onClick={onCopyCode}
                            className="rounded-xl border border-[#d6dde7] px-3 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#50637f] transition hover:bg-[#f7f9fb]"
                        >
                            {isCopyingCode ? "Copied" : "Copy"}
                        </button>
                    </div>
                </section>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={onLeaveLobby}
                        disabled={isLeavingLobby}
                        className="rounded-full border border-[#d6dde7] bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f] transition hover:bg-[#f7f9fb] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isLeavingLobby ? "Leaving..." : "Leave Lobby"}
                    </button>
                    <button
                        type="button"
                        onClick={onOpenManagePlayers}
                        disabled={!isHost}
                        className={`text-right text-sm font-extrabold uppercase tracking-[0.18em] sm:ml-auto ${isHost ? "text-[#c47b3f] transition hover:text-[#b5672f]" : "cursor-not-allowed text-[#b8c1cf]"}`}
                    >
                        Manage Players
                    </button>
                    {isHost ? (
                        <button
                            type="button"
                            onClick={onStartGame}
                            className="rounded-full bg-[#081b47] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                        >
                            Start Game
                        </button>
                    ) : null}
                </div>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {players.map((player) => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            isCurrentHost={player.user_id === currentUserId && player.role === "host"}
                        />
                    ))}
                    {Array.from({ length: waitingSlots }).map((_, index) => (
                        <WaitingCard key={`waiting-${index}`} />
                    ))}
                </section>

                <ManagePlayersModal
                    isOpen={isManagePlayersOpen}
                    isHost={Boolean(isHost)}
                    players={players}
                    isAddingVirtualPlayer={isAddingVirtualPlayer}
                    kickingPlayerId={kickingPlayerId}
                    onAddVirtualPlayer={onAddVirtualPlayer}
                    onClose={onCloseManagePlayers}
                    onKickPlayer={onKickPlayer}
                />
                <StartGameModal
                    isOpen={isStartGameOpen}
                    isHost={Boolean(isHost)}
                    players={players}
                    dealerOrderUserIds={dealerOrderUserIds}
                    isSaving={isSavingDealerOrder}
                    onClose={onCloseStartGame}
                    onMoveDealer={onMoveDealer}
                    onConfirm={onConfirmDealerOrder}
                />
            </div>
        </main>
    );
}

function isCurrentUserInRoom(lobby, currentUserId) {
    if (!currentUserId) {
        return true;
    }

    return lobby.players.some((player) => player.user_id === currentUserId);
}

function sortPlayersByJoinTime(players) {
    return [...players].sort(
        (leftPlayer, rightPlayer) =>
            new Date(leftPlayer.joined_at).getTime() -
            new Date(rightPlayer.joined_at).getTime(),
    );
}

function upsertPlayer(players, nextPlayer) {
    const existingIndex = players.findIndex((player) => player.id === nextPlayer.id);

    if (existingIndex >= 0) {
        const nextPlayers = [...players];
        nextPlayers[existingIndex] = nextPlayer;
        return sortPlayersByJoinTime(nextPlayers);
    }

    return sortPlayersByJoinTime([...players, nextPlayer]);
}

function removePlayerByUserId(players, userId) {
    return sortPlayersByJoinTime(
        players.filter((player) => player.user_id !== userId),
    );
}

function getGameUrl(gameName, roomId) {
    return `/game/${encodeURIComponent(gameName)}/${roomId}`;
}

function redirectToGame(router, room) {
    if (!room?.id || !room?.selected_game) {
        return;
    }

    void router.push(getGameUrl(room.selected_game, room.id));
}

export default function LobbyPage() {
    const router = useRouter();
    const [hostName, setHostName] = useState("");
    const [currentUserId, setCurrentUserId] = useState("");
    const [roomData, setRoomData] = useState(null);
    const [status, setStatus] = useState("Loading lobby...");
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [isCopyingCode, setIsCopyingCode] = useState(false);
    const [isLeavingLobby, setIsLeavingLobby] = useState(false);
    const [isManagePlayersOpen, setIsManagePlayersOpen] = useState(false);
    const [isAddingVirtualPlayer, setIsAddingVirtualPlayer] = useState(false);
    const [kickingPlayerId, setKickingPlayerId] = useState("");
    const [isStartGameOpen, setIsStartGameOpen] = useState(false);
    const [dealerOrderUserIds, setDealerOrderUserIds] = useState([]);
    const [isSavingDealerOrder, setIsSavingDealerOrder] = useState(false);
    const currentUserIdRef = useRef("");
    const routerRef = useRef(router);

    const roomCode = formatRoomCode(
        typeof router.query.code === "string" ? router.query.code : "",
    );
    const isSelectionMode = router.query.mode === "select" && !roomCode;
    const lobbyCacheKey = roomCode ? `${LOBBY_CACHE_PREFIX}${roomCode}` : "";

    useEffect(() => {
        currentUserIdRef.current = currentUserId;
    }, [currentUserId]);

    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    useEffect(() => {
        let isMounted = true;

        async function loadUser() {
            try {
                const user = await getCurrentUser();

                if (!isMounted) {
                    return;
                }

                setHostName(user?.user_metadata?.display_name || "");
                setCurrentUserId(user?.id || "");
            } catch {
                if (isMounted) {
                    setHostName("");
                    setCurrentUserId("");
                }
            }
        }

        void loadUser();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!roomCode) {
            setRoomData(null);
            setStatus(isSelectionMode ? "" : "No room selected.");
            return;
        }

        const cachedLobby = readStoredJson(lobbyCacheKey);

        if (cachedLobby?.room?.room_code === roomCode && Array.isArray(cachedLobby?.players)) {
            setRoomData(cachedLobby);
            setStatus("");
        }

        let isMounted = true;

        async function loadLobby() {
            try {
                const lobby = await getLobbyByCode(roomCode);

                if (!isMounted) {
                    return;
                }

                if (lobby.room.status === "in_game") {
                    redirectToGame(routerRef.current, lobby.room);
                    return;
                }

                setRoomData(lobby);
                setStatus("");

                if (!currentUserIdRef.current) {
                    return;
                }

                await syncRoomPlayerActivity(roomCode);
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                const message = error.message || "Unable to load the lobby.";
                setStatus(message);
                setRoomData(null);

                if (message === "Room not found.") {
                    clearStoredValue(lobbyCacheKey);
                    void routerRef.current.replace("/");
                }
            }
        }

        void loadLobby();

        return () => {
            isMounted = false;
        };
    }, [currentUserId, isSelectionMode, lobbyCacheKey, roomCode]);

    useEffect(() => {
        if (!lobbyCacheKey || !roomData?.room?.room_code) {
            return;
        }

        writeStoredJson(lobbyCacheKey, roomData);
    }, [lobbyCacheKey, roomData]);

    useEffect(() => {
        if (roomCode || !currentUserId) {
            return;
        }

        let isMounted = true;

        async function redirectActiveInGameRoom() {
            try {
                const activeRoom = await getActiveRoomForCurrentUser();

                if (
                    !isMounted ||
                    activeRoom?.status !== "in_game" ||
                    !activeRoom.id ||
                    !activeRoom.selected_game
                ) {
                    return;
                }

                redirectToGame(routerRef.current, activeRoom);
            } catch {
                // Stay on lobby selection/no-room view if active-room lookup fails.
            }
        }

        void redirectActiveInGameRoom();

        return () => {
            isMounted = false;
        };
    }, [currentUserId, roomCode]);

    useEffect(() => {
        if (!currentUserId || !roomData || isCurrentUserInRoom(roomData, currentUserId)) {
            return;
        }

        setStatus("You were removed from the lobby.");
        setRoomData(null);
        setIsManagePlayersOpen(false);
        setIsStartGameOpen(false);
        clearStoredValue(lobbyCacheKey);
        void routerRef.current.replace("/");
    }, [currentUserId, lobbyCacheKey, roomData?.players]);

    function handleRoomSubscriptionEvent(payload) {
        const activeUserId = currentUserIdRef.current;
        const activeRouter = routerRef.current;

        if (payload.sourceTable === "room_players") {
            if (payload.eventType === "DELETE") {
                if (!payload.old?.user_id) {
                    return;
                }

                if (payload.old.user_id === activeUserId) {
                    setStatus("You were removed from the lobby.");
                    setRoomData(null);
                    setIsManagePlayersOpen(false);
                    setIsStartGameOpen(false);
                    clearStoredValue(lobbyCacheKey);
                    void activeRouter.replace("/");
                    return;
                }

                setRoomData((current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,
                        players: removePlayerByUserId(
                            current.players,
                            payload.old.user_id,
                        ),
                        room: {
                            ...current.room,
                            dealer_order: (current.room.dealer_order || []).filter(
                                (userId) => userId !== payload.old.user_id,
                            ),
                        },
                    };
                });
                setStatus("");
                return;
            }

            if (!payload.new) {
                return;
            }

            if (payload.new.is_active === false) {
                if (payload.new.user_id === activeUserId) {
                    setStatus("You were removed from the lobby.");
                    setRoomData(null);
                    setIsManagePlayersOpen(false);
                    setIsStartGameOpen(false);
                    clearStoredValue(lobbyCacheKey);
                    void activeRouter.replace("/");
                    return;
                }

                setRoomData((current) => {
                    if (!current) {
                        return current;
                    }

                    return {
                        ...current,
                        players: removePlayerByUserId(current.players, payload.new.user_id),
                        room: {
                            ...current.room,
                            dealer_order: (current.room.dealer_order || []).filter(
                                (userId) => userId !== payload.new.user_id,
                            ),
                        },
                    };
                });
                setStatus("");
                return;
            }

            setRoomData((current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    players: upsertPlayer(current.players, payload.new),
                };
            });
            setStatus("");
            return;
        }

        if (payload.eventType === "DELETE") {
            setStatus("Room not found.");
            setRoomData(null);
            setIsManagePlayersOpen(false);
            setIsStartGameOpen(false);
            clearStoredValue(lobbyCacheKey);
            void activeRouter.replace("/");
            return;
        }

        if (!payload.new) {
            return;
        }

        if (payload.new.status === "in_game") {
            redirectToGame(activeRouter, payload.new);
            return;
        }

        setRoomData((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                room: payload.new,
            };
        });
        setStatus("");
    }

    useEffect(() => {
        if (!roomData?.room?.id) {
            return undefined;
        }

        return subscribeToRoom(
            roomData.room.id,
            handleRoomSubscriptionEvent,
            (subscriptionStatus) => {
                if (subscriptionStatus === "SUBSCRIBED") {
                    setStatus("");
                    return;
                }

                if (subscriptionStatus === "CHANNEL_ERROR") {
                    setStatus("Realtime subscription failed.");
                    return;
                }

                if (subscriptionStatus === "TIMED_OUT") {
                    setStatus("Realtime subscription timed out.");
                    return;
                }

                if (subscriptionStatus === "CLOSED") {
                    setStatus("Realtime connection closed.");
                }
            },
        );
    }, [roomData?.room?.id]);

    useEffect(() => {
        if (!roomData?.players) {
            return;
        }

        setDealerOrderUserIds((currentOrder) =>
            buildDealerOrder(
                roomData.players,
                isStartGameOpen ? currentOrder : (roomData.room.dealer_order || []),
            ),
        );
    }, [isStartGameOpen, roomData?.players, roomData?.room?.dealer_order]);

    async function handleCreateRoom(selectedGame) {
        setIsCreatingRoom(true);
        setStatus(`Creating ${selectedGame} room...`);

        try {
            const room = await createRoom(selectedGame);
            await router.replace(`/lobby?code=${room.room_code}`);
        } catch (error) {
            setStatus(error.message || "Unable to create the room.");
        } finally {
            setIsCreatingRoom(false);
        }
    }

    async function handleCopyCode() {
        if (!roomData?.room?.room_code) {
            return;
        }

        try {
            await navigator.clipboard.writeText(roomData.room.room_code);
            setIsCopyingCode(true);
            window.setTimeout(() => setIsCopyingCode(false), 1500);
        } catch {
            setIsCopyingCode(false);
        }
    }

    function handleStartGame() {
        if (!roomData?.room || currentUserId !== roomData.room.host_user_id) {
            return;
        }

        setDealerOrderUserIds((currentOrder) =>
            buildDealerOrder(roomData.players, currentOrder),
        );
        setIsStartGameOpen(true);
    }

    async function handleLeaveLobby() {
        if (!roomCode) {
            return;
        }

        setIsLeavingLobby(true);

        try {
            await leaveRoom(roomCode);
            clearStoredValue(lobbyCacheKey);
            await router.replace("/");
        } catch (error) {
            setStatus(error.message || "Unable to leave the lobby.");
            setIsLeavingLobby(false);
        }
    }

    function handleOpenManagePlayers() {
        if (!roomData?.room || currentUserId !== roomData.room.host_user_id) {
            return;
        }

        setIsManagePlayersOpen(true);
    }

    function handleCloseManagePlayers() {
        setIsManagePlayersOpen(false);
        setKickingPlayerId("");
    }

    function handleCloseStartGame() {
        setIsStartGameOpen(false);
    }

    async function handleKickPlayer(playerUserId) {
        if (!roomCode) {
            return;
        }

        setKickingPlayerId(playerUserId);

        try {
            await kickPlayerFromRoom(roomCode, playerUserId);
            setStatus("Player removed from the lobby.");
        } catch (error) {
            setStatus(error.message || "Unable to remove player.");
        } finally {
            setKickingPlayerId("");
        }
    }

    async function handleAddVirtualPlayer(displayName) {
        if (!roomCode) {
            return;
        }

        setIsAddingVirtualPlayer(true);

        try {
            const addedPlayer = await addVirtualPlayerToRoom(roomCode, displayName);
            setRoomData((current) => {
                if (!current || !addedPlayer) {
                    return current;
                }

                return {
                    ...current,
                    players: upsertPlayer(current.players, addedPlayer),
                };
            });
            setStatus(`Added virtual player ${displayName}.`);
        } catch (error) {
            setStatus(error.message || "Unable to add virtual player.");
        } finally {
            setIsAddingVirtualPlayer(false);
        }
    }

    function handleMoveDealer(fromIndex, toIndex) {
        setDealerOrderUserIds((currentOrder) => moveItem(currentOrder, fromIndex, toIndex));
    }

    async function handleConfirmDealerOrder() {
        const orderedPlayers = dealerOrderUserIds
            .map((userId) =>
                roomData?.players.find((player) => player.user_id === userId),
            )
            .filter(Boolean);

        if (!orderedPlayers.length) {
            setStatus("Add players before starting the game.");
            return;
        }

        setIsSavingDealerOrder(true);

        try {
            const savedRoom = await saveRoomDealerOrder(roomCode, dealerOrderUserIds);
            setRoomData((current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    room: savedRoom || {
                        ...current.room,
                        dealer_order: dealerOrderUserIds,
                        current_dealer_user_id: dealerOrderUserIds[0],
                    },
                };
            });
            setStatus(
                `Dealer order set: ${orderedPlayers.map((player) => player.display_name).join(", ")}.`,
            );
            setIsStartGameOpen(false);
            redirectToGame(router, savedRoom || roomData.room);
        } catch (error) {
            setStatus(error.message || "Unable to save dealer order.");
        } finally {
            setIsSavingDealerOrder(false);
        }
    }

    if (isSelectionMode) {
        return (
            <>
                <SelectionView
                    hostName={hostName}
                    isCreatingRoom={isCreatingRoom}
                    onCreateRoom={handleCreateRoom}
                />
                {status ? (
                    <p className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-[#081b47] px-4 py-2 text-sm font-extrabold text-white">
                        {status}
                    </p>
                ) : null}
            </>
        );
    }

    if (!roomData) {
        return (
            <main
                className={`${bodyFont.className} relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef5f3] px-6 text-center text-[#081b47]`}
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
                <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
                <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
                <div className="relative space-y-3">
                    <h1 className={`${headingFont.className} text-4xl font-extrabold`}>
                        Lobby
                    </h1>
                    <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                        {status}
                    </p>
                </div>
            </main>
        );
    }

    return (
        <RoomView
            room={roomData.room}
            players={roomData.players}
            currentUserId={currentUserId}
            isCopyingCode={isCopyingCode}
            onCopyCode={handleCopyCode}
            onLeaveLobby={handleLeaveLobby}
            isLeavingLobby={isLeavingLobby}
            isManagePlayersOpen={isManagePlayersOpen}
            isAddingVirtualPlayer={isAddingVirtualPlayer}
            onOpenManagePlayers={handleOpenManagePlayers}
            onAddVirtualPlayer={handleAddVirtualPlayer}
            onCloseManagePlayers={handleCloseManagePlayers}
            onKickPlayer={handleKickPlayer}
            kickingPlayerId={kickingPlayerId}
            isStartGameOpen={isStartGameOpen}
            dealerOrderUserIds={dealerOrderUserIds}
            isSavingDealerOrder={isSavingDealerOrder}
            onCloseStartGame={handleCloseStartGame}
            onMoveDealer={handleMoveDealer}
            onConfirmDealerOrder={handleConfirmDealerOrder}
            onStartGame={handleStartGame}
        />
    );
}
