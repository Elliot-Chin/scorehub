import { createClient } from "@supabase/supabase-js";

export const DISPLAY_NAME_STORAGE_KEY = "game-scorer.display-name";
const ACTIVITY_SYNC_INTERVAL_MS = 60 * 1000;
const ROOM_ACTIVITY_SYNC_INTERVAL_MS = 15 * 1000;
const ROOM_CODE_LENGTH = 4;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let authOperationQueue = Promise.resolve();
let lastActivitySyncedAt = 0;

function getStorageValue(key) {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function setStorageValue(key, value) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage can be unavailable in private mode or restricted webviews.
    }
}

function removeStorageValue(key) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.removeItem(key);
    } catch {
        // Storage can be unavailable in private mode or restricted webviews.
    }
}

function getStorageKeys() {
    if (typeof window === "undefined") {
        return [];
    }

    try {
        return Object.keys(window.localStorage);
    } catch {
        return [];
    }
}

function hasIntervalElapsed(storageKey, intervalMs) {
    const lastSyncedAt = Number(getStorageValue(storageKey));

    if (!Number.isFinite(lastSyncedAt) || lastSyncedAt <= 0) {
        return true;
    }

    return Date.now() - lastSyncedAt >= intervalMs;
}

function getMetadataDisplayName(user, displayName) {
    return displayName?.trim() || user?.user_metadata?.display_name || "";
}

function buildUserMetadata(user, displayName) {
    const now = new Date().toISOString();
    const resolvedDisplayName = getMetadataDisplayName(user, displayName);

    if (!resolvedDisplayName) {
        throw new Error("Display name is required.");
    }

    return {
        ...user?.user_metadata,
        display_name: resolvedDisplayName,
        created_at: user?.user_metadata?.created_at || user?.created_at || now,
        last_active_at: now,
    };
}

function canSyncActivity(force) {
    if (force) {
        return true;
    }

    if (!Number.isFinite(lastActivitySyncedAt) || lastActivitySyncedAt <= 0) {
        return true;
    }

    return Date.now() - lastActivitySyncedAt >= ACTIVITY_SYNC_INTERVAL_MS;
}

function rememberActivitySync() {
    lastActivitySyncedAt = Date.now();
}

function getRoomActivitySyncKey(roomCode, userId) {
    return `game-scorer.room-active-sync.${roomCode}.${userId}`;
}

function canSyncRoomActivity(roomCode, userId) {
    if (typeof window === "undefined" || !roomCode || !userId) {
        return true;
    }

    return hasIntervalElapsed(
        getRoomActivitySyncKey(roomCode, userId),
        ROOM_ACTIVITY_SYNC_INTERVAL_MS,
    );
}

function rememberRoomActivitySync(roomCode, userId) {
    if (!roomCode || !userId) {
        return;
    }

    setStorageValue(
        getRoomActivitySyncKey(roomCode, userId),
        String(Date.now()),
    );
}

function buildRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return code;
}

function normalizeRoomCode(value) {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

function getRequiredUserDisplayName(user) {
    const displayName = user?.user_metadata?.display_name?.trim();

    if (!displayName) {
        throw new Error("Display name is required.");
    }

    return displayName;
}

function runSerializedAuthOperation(operation) {
    const queuedOperation = authOperationQueue.then(operation, operation);

    authOperationQueue = queuedOperation.then(
        () => undefined,
        () => undefined,
    );

    return queuedOperation;
}

function withSourceTable(sourceTable, callback) {
    return (payload) => {
        callback({
            ...payload,
            sourceTable,
        });
    };
}

function deletedRowMatchesRoom(payload, roomId) {
    return !payload.old?.room_id || payload.old.room_id === roomId;
}

function isMissingColumnError(error, columnName) {
    return (
        error?.code === "42703" ||
        error?.code === "PGRST204" ||
        error?.message?.includes(`'${columnName}'`) ||
        error?.message?.includes(`"${columnName}"`)
    );
}

async function upsertRoomPlayer(row) {
    const client = getSupabaseBrowserClient();
    const { error } = await client.from("room_players").upsert(row, {
        onConflict: "room_id,user_id",
    });

    if (
        error &&
        (isMissingColumnError(error, "is_active") ||
            isMissingColumnError(error, "removed_at"))
    ) {
        const { is_active: _isActive, removed_at: _removedAt, ...legacyRow } = row;
        const { error: legacyError } = await client
            .from("room_players")
            .upsert(legacyRow, {
                onConflict: "room_id,user_id",
            });

        if (legacyError) {
            throw legacyError;
        }

        return;
    }

    if (error) {
        throw error;
    }
}

export function getSupabaseBrowserClient() {
    if (!globalThis.__gameScorerSupabaseClient) {
        if (!supabaseUrl || !supabasePublishableKey) {
            throw new Error("Missing Supabase environment variables.");
        }

        globalThis.__gameScorerSupabaseClient = createClient(
            supabaseUrl,
            supabasePublishableKey,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
            },
        );
    }

    return globalThis.__gameScorerSupabaseClient;
}

export async function getCurrentUser() {
    return runSerializedAuthOperation(async () => {
        const client = getSupabaseBrowserClient();
        const { data, error } = await client.auth.getSession();

        if (error) {
            throw error;
        }

        return data.session?.user || null;
    });
}

export async function signInOrUpdateAnonymousUser(displayName) {
    return runSerializedAuthOperation(async () => {
        const trimmedDisplayName = displayName.trim();

        if (!trimmedDisplayName) {
            throw new Error("Enter a display name first.");
        }

        const client = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        const existingUser = sessionData.session?.user || null;

        if (!existingUser) {
            const { data, error } = await client.auth.signInAnonymously({
                options: {
                    data: buildUserMetadata(null, trimmedDisplayName),
                },
            });

            if (error) {
                throw error;
            }

            rememberActivitySync();

            return {
                user: data.user,
                isNewUser: true,
            };
        }

        const { data, error } = await client.auth.updateUser({
            data: buildUserMetadata(existingUser, trimmedDisplayName),
        });

        if (error) {
            throw error;
        }

        rememberActivitySync();

        return {
            user: data.user,
            isNewUser: false,
        };
    });
}

export async function syncAnonymousActivity(displayName, options = {}) {
    return runSerializedAuthOperation(async () => {
        if (!canSyncActivity(options.force)) {
            return { user: null, skipped: true };
        }

        const client = getSupabaseBrowserClient();
        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        const user = sessionData.session?.user || null;

        if (!user) {
            return { user: null, skipped: true };
        }

        const resolvedDisplayName = getMetadataDisplayName(user, displayName);

        if (!resolvedDisplayName) {
            return { user, skipped: true };
        }

        const { data, error } = await client.auth.updateUser({
            data: buildUserMetadata(user, resolvedDisplayName),
        });

        if (error) {
            throw error;
        }

        rememberActivitySync();

        return {
            user: data.user,
            skipped: false,
        };
    });
}

export async function createRoom(selectedGame) {
    const client = getSupabaseBrowserClient();
    const user = await getCurrentUser();

    if (!user) {
        throw new Error("You must be signed in to create a room.");
    }

    const displayName = getRequiredUserDisplayName(user);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const roomCode = buildRoomCode();
        const { data: room, error: roomError } = await client
            .from("rooms")
            .insert({
                host_user_id: user.id,
                room_code: roomCode,
                selected_game: selectedGame,
                status: "lobby",
            })
            .select()
            .single();

        if (roomError) {
            if (roomError.code === "23505") {
                continue;
            }

            throw roomError;
        }

        await upsertRoomPlayer({
            room_id: room.id,
            room_code: roomCode,
            user_id: user.id,
            display_name: displayName,
            role: "host",
            is_active: true,
            removed_at: null,
        });

        return room;
    }

    throw new Error("Unable to create a unique room code. Try again.");
}

export async function joinRoomByCode(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const user = await getCurrentUser();

    if (!user) {
        throw new Error("You must be signed in to join a room.");
    }

    const displayName = getRequiredUserDisplayName(user);
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Enter a 4-character room code.");
    }

    const { data: room, error: roomError } = await client
        .from("rooms")
        .select("id, room_code, selected_game, status, host_user_id")
        .eq("room_code", roomCode)
        .single();

    if (roomError) {
        throw new Error("Room not found.");
    }

    await upsertRoomPlayer({
        room_id: room.id,
        room_code: room.room_code,
        user_id: user.id,
        display_name: displayName,
        role: room.host_user_id === user.id ? "host" : "player",
        last_active_at: new Date().toISOString(),
        is_active: true,
        removed_at: null,
    });

    return room;
}

export async function addVirtualPlayerToRoom(roomCodeInput, displayNameInput) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);
    const displayName = displayNameInput.trim();

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    if (!displayName) {
        throw new Error("Enter a virtual player name.");
    }

    const { data, error } = await client.rpc("add_virtual_player_to_room", {
        p_room_code: roomCode,
        p_display_name: displayName,
    });

    if (error) {
        if (error.message === "room_not_found") {
            throw new Error("Room not found.");
        }

        if (error.message === "forbidden") {
            throw new Error("Only the host can add virtual players.");
        }

        if (error.message === "invalid_display_name") {
            throw new Error("Enter a virtual player name.");
        }

        if (error.message === "game_already_started") {
            throw new Error("Add virtual players before starting the game.");
        }

        throw error;
    }

    return data;
}

export async function getLobbyByCode(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    let { data: room, error: roomError } = await client
        .from("rooms")
        .select("id, room_code, selected_game, status, host_user_id, dealer_order, current_dealer_user_id")
        .eq("room_code", roomCode)
        .single();

    if (
        roomError &&
        (isMissingColumnError(roomError, "dealer_order") ||
            isMissingColumnError(roomError, "current_dealer_user_id"))
    ) {
        const legacyRoomResult = await client
            .from("rooms")
            .select("id, room_code, selected_game, status, host_user_id")
            .eq("room_code", roomCode)
            .single();

        room = legacyRoomResult.data
            ? {
                  ...legacyRoomResult.data,
                  dealer_order: [],
                  current_dealer_user_id: null,
              }
            : null;
        roomError = legacyRoomResult.error;
    }

    if (roomError) {
        throw new Error("Room not found.");
    }

    let { data: players, error: playersError } = await client
        .from("room_players")
        .select("id, user_id, display_name, role, joined_at, last_active_at, is_active, removed_at, is_virtual, created_by_user_id")
        .eq("room_id", room.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true });

    if (
        playersError &&
        (isMissingColumnError(playersError, "is_active") ||
            isMissingColumnError(playersError, "is_virtual") ||
            isMissingColumnError(playersError, "created_by_user_id") ||
            isMissingColumnError(playersError, "removed_at"))
    ) {
        const legacyPlayersResult = await client
            .from("room_players")
            .select("id, user_id, display_name, role, joined_at, last_active_at")
            .eq("room_id", room.id)
            .order("joined_at", { ascending: true });

        players = (legacyPlayersResult.data || []).map((player) => ({
            ...player,
            is_active: true,
            is_virtual: false,
            created_by_user_id: null,
            removed_at: null,
        }));
        playersError = legacyPlayersResult.error;
    }

    if (playersError) {
        throw playersError;
    }

    return {
        room,
        players: players || [],
    };
}

export async function getActiveRoomForCurrentUser() {
    const client = getSupabaseBrowserClient();
    const user = await getCurrentUser();

    if (!user) {
        return null;
    }

    let { data: playerRows, error: playerError } = await client
        .from("room_players")
        .select("room_id, room_code")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: false })
        .limit(5);

    if (playerError && isMissingColumnError(playerError, "is_active")) {
        const legacyPlayerResult = await client
            .from("room_players")
            .select("room_id, room_code")
            .eq("user_id", user.id)
            .order("joined_at", { ascending: false })
            .limit(5);

        playerRows = legacyPlayerResult.data;
        playerError = legacyPlayerResult.error;
    }

    if (playerError) {
        throw playerError;
    }

    if (!playerRows?.length) {
        return null;
    }

    for (const playerRow of playerRows) {
        if (!playerRow?.room_id) {
            continue;
        }

        const { data: room, error: roomError } = await client
            .from("rooms")
            .select("id, room_code, selected_game, status, host_user_id")
            .eq("id", playerRow.room_id)
            .maybeSingle();

        if (roomError) {
            throw roomError;
        }

        if (room) {
            return room;
        }
    }

    return null;
}

export async function syncRoomPlayerActivity(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const user = await getCurrentUser();

    if (!user) {
        return;
    }

    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        return;
    }

    if (!canSyncRoomActivity(roomCode, user.id)) {
        return;
    }

    const { error } = await client
        .from("room_players")
        .update({
            display_name: getRequiredUserDisplayName(user),
            last_active_at: new Date().toISOString(),
        })
        .eq("room_code", roomCode)
        .eq("user_id", user.id)
        .eq("is_active", true);

    if (error && isMissingColumnError(error, "is_active")) {
        await client
            .from("room_players")
            .update({
                display_name: getRequiredUserDisplayName(user),
                last_active_at: new Date().toISOString(),
            })
            .eq("room_code", roomCode)
            .eq("user_id", user.id);
        rememberRoomActivitySync(roomCode, user.id);
        return;
    }

    if (error) {
        throw error;
    }

    rememberRoomActivitySync(roomCode, user.id);
}

export async function leaveRoom(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    const { data, error } = await client.rpc("leave_room", {
        p_room_code: roomCode,
    });

    if (error) {
        throw error;
    }

    if (data === "room_not_found") {
        return;
    }

    if (data === "player_not_in_room") {
        throw new Error("Player was not removed from the room.");
    }
}

export async function kickPlayerFromRoom(roomCodeInput, playerUserId) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    if (!playerUserId) {
        throw new Error("Select a player to remove.");
    }

    const { data, error } = await client.rpc("kick_player_from_room", {
        p_room_code: roomCode,
        p_player_user_id: playerUserId,
    });

    if (error) {
        throw error;
    }

    if (data === "room_not_found") {
        throw new Error("Room not found.");
    }

    if (data === "forbidden") {
        throw new Error("Only the host can manage players.");
    }

    if (data === "cannot_kick_host") {
        throw new Error("The host cannot be kicked from the room.");
    }

    if (data === "player_not_in_room") {
        throw new Error("Player is no longer in the room.");
    }
}

export async function saveRoomDealerOrder(roomCodeInput, dealerOrderUserIds) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    if (!Array.isArray(dealerOrderUserIds) || !dealerOrderUserIds.length) {
        throw new Error("Set a dealer order before starting.");
    }

    const { data, error } = await client.rpc("set_room_dealer_order", {
        p_room_code: roomCode,
        p_dealer_order: dealerOrderUserIds,
    });

    if (error) {
        if (error.message === "room_not_found") {
            throw new Error("Room not found.");
        }

        if (error.message === "forbidden") {
            throw new Error("Only the host can start the game.");
        }

        if (error.message === "invalid_dealer_order") {
            throw new Error("Dealer order must include each current player exactly once.");
        }

        throw error;
    }

    return data;
}

export async function getGameScoreboard(roomId) {
    const client = getSupabaseBrowserClient();

    if (!roomId) {
        throw new Error("Missing room id.");
    }

    const { data: room, error: roomError } = await client
        .from("rooms")
        .select("id, room_code, selected_game, status, host_user_id, dealer_order, current_dealer_user_id")
        .eq("id", roomId)
        .single();

    if (roomError) {
        throw new Error("Room not found.");
    }

    const { data: players, error: playersError } = await client
        .from("room_players")
        .select("id, user_id, display_name, role, joined_at, is_active, is_virtual, created_by_user_id")
        .eq("room_id", room.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true });

    if (playersError) {
        throw playersError;
    }

    const { data: scores, error: scoresError } = await client
        .from("game_scores")
        .select("id, room_id, user_id, score, updated_at")
        .eq("room_id", room.id);

    if (scoresError) {
        throw scoresError;
    }

    return {
        room,
        players: players || [],
        scores: scores || [],
    };
}

export async function savePlayerScore(roomId, playerUserId, score) {
    const client = getSupabaseBrowserClient();

    if (!roomId || !playerUserId) {
        throw new Error("Missing score target.");
    }

    const nextScore = Number(score);

    if (!Number.isFinite(nextScore)) {
        throw new Error("Score must be a number.");
    }

    const { data, error } = await client
        .from("game_scores")
        .upsert(
            {
                room_id: roomId,
                user_id: playerUserId,
                score: Math.trunc(nextScore),
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "room_id,user_id",
            },
        )
        .select("id, room_id, user_id, score, updated_at")
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function advanceRoomDealer(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    const { data, error } = await client.rpc("advance_room_dealer", {
        p_room_code: roomCode,
    });

    if (error) {
        if (error.message === "room_not_found") {
            throw new Error("Room not found.");
        }

        if (error.message === "dealer_order_not_set") {
            throw new Error("Dealer order is not set.");
        }

        if (error.message === "forbidden") {
            throw new Error("Only active room players can advance the round.");
        }

        throw error;
    }

    return data;
}

export function subscribeToGame(roomId, onGameEvent, onStatusChange) {
    const client = getSupabaseBrowserClient();
    const channel = client
        .channel(`game:${roomId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "rooms",
                filter: `id=eq.${roomId}`,
            },
            withSourceTable("rooms", onGameEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "rooms",
            },
            (payload) => {
                if (payload.old?.id === roomId) {
                    withSourceTable("rooms", onGameEvent)(payload);
                }
            },
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "room_players",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("room_players", onGameEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "room_players",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("room_players", onGameEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "room_players",
            },
            (payload) => {
                if (deletedRowMatchesRoom(payload, roomId)) {
                    withSourceTable("room_players", onGameEvent)(payload);
                }
            },
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "game_scores",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("game_scores", onGameEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "game_scores",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("game_scores", onGameEvent),
        )
        .subscribe((status) => {
            onStatusChange?.(status);
        });

    return () => {
        void client.removeChannel(channel);
    };
}

export function subscribeToRoom(roomId, onRoomEvent, onStatusChange) {
    const client = getSupabaseBrowserClient();
    const channel = client
        .channel(`room:${roomId}`)
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "rooms",
                filter: `id=eq.${roomId}`,
            },
            withSourceTable("rooms", onRoomEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "rooms",
            },
            (payload) => {
                if (payload.old?.id === roomId) {
                    withSourceTable("rooms", onRoomEvent)(payload);
                }
            },
        )
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "room_players",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("room_players", onRoomEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "room_players",
                filter: `room_id=eq.${roomId}`,
            },
            withSourceTable("room_players", onRoomEvent),
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "room_players",
            },
            (payload) => {
                if (deletedRowMatchesRoom(payload, roomId)) {
                    withSourceTable("room_players", onRoomEvent)(payload);
                }
            },
        )
        .subscribe((status) => {
            onStatusChange?.(status);
        });

    return () => {
        void client.removeChannel(channel);
    };
}

export function formatRoomCode(roomCodeInput) {
    return normalizeRoomCode(roomCodeInput);
}

export function isVirtualPlayer(player) {
    return Boolean(player?.is_virtual);
}

export function readStoredJson(key) {
    const value = getStorageValue(key);

    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

export function writeStoredJson(key, value) {
    try {
        setStorageValue(key, JSON.stringify(value));
    } catch {
        // Ignore serialization/storage failures.
    }
}

export function clearStoredValue(key) {
    removeStorageValue(key);
}

export function clearStoredValuesByPrefix(prefixes, options = {}) {
    const normalizedPrefixes = Array.isArray(prefixes)
        ? prefixes.filter(Boolean)
        : [prefixes].filter(Boolean);
    const keepKeys = new Set(Array.isArray(options.keepKeys) ? options.keepKeys : []);

    if (!normalizedPrefixes.length) {
        return;
    }

    for (const key of getStorageKeys()) {
        if (keepKeys.has(key)) {
            continue;
        }

        if (normalizedPrefixes.some((prefix) => key.startsWith(prefix))) {
            removeStorageValue(key);
        }
    }
}
