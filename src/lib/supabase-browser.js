import { createClient } from "@supabase/supabase-js";

export const DISPLAY_NAME_STORAGE_KEY = "game-scorer.display-name";
const LAST_ACTIVE_SYNC_KEY = "game-scorer.last-active-sync";
const ACTIVITY_SYNC_INTERVAL_MS = 60 * 1000;
const ROOM_CODE_LENGTH = 4;

let supabase;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let authOperationQueue = Promise.resolve();

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
    if (force || typeof window === "undefined") {
        return true;
    }

    const lastSyncedAt = window.localStorage.getItem(LAST_ACTIVE_SYNC_KEY);

    if (!lastSyncedAt) {
        return true;
    }

    return Date.now() - Number(lastSyncedAt) >= ACTIVITY_SYNC_INTERVAL_MS;
}

function rememberActivitySync() {
    if (typeof window === "undefined") {
        return;
    }

    window.localStorage.setItem(LAST_ACTIVE_SYNC_KEY, String(Date.now()));
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

export function getSupabaseBrowserClient() {
    if (!supabase) {
        if (!supabaseUrl || !supabasePublishableKey) {
            throw new Error("Missing Supabase environment variables.");
        }

        supabase = createClient(
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

    return supabase;
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

        const { error: playerError } = await client.from("room_players").upsert(
            {
                room_id: room.id,
                room_code: roomCode,
                user_id: user.id,
                display_name: displayName,
                role: "host",
                is_active: true,
                removed_at: null,
            },
            {
                onConflict: "room_id,user_id",
            },
        );

        if (playerError) {
            throw playerError;
        }

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

    const { error: playerError } = await client.from("room_players").upsert(
        {
            room_id: room.id,
            room_code: room.room_code,
            user_id: user.id,
            display_name: displayName,
            role: room.host_user_id === user.id ? "host" : "player",
            last_active_at: new Date().toISOString(),
            is_active: true,
            removed_at: null,
        },
        {
            onConflict: "room_id,user_id",
        },
    );

    if (playerError) {
        throw playerError;
    }

    return room;
}

export async function getLobbyByCode(roomCodeInput) {
    const client = getSupabaseBrowserClient();
    const roomCode = normalizeRoomCode(roomCodeInput);

    if (roomCode.length !== ROOM_CODE_LENGTH) {
        throw new Error("Invalid room code.");
    }

    const { data: room, error: roomError } = await client
        .from("rooms")
        .select("id, room_code, selected_game, status, host_user_id, dealer_order")
        .eq("room_code", roomCode)
        .single();

    if (roomError) {
        throw new Error("Room not found.");
    }

    const { data: players, error: playersError } = await client
        .from("room_players")
        .select("id, user_id, display_name, role, joined_at, last_active_at, is_active, removed_at")
        .eq("room_id", room.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: true });

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

    const { data: playerRow, error: playerError } = await client
        .from("room_players")
        .select("room_id, room_code")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (playerError) {
        throw playerError;
    }

    if (!playerRow?.room_code) {
        return null;
    }

    const { data: room, error: roomError } = await client
        .from("rooms")
        .select("id, room_code, selected_game, status, host_user_id")
        .eq("id", playerRow.room_id)
        .maybeSingle();

    if (roomError) {
        throw roomError;
    }

    return room || null;
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

    await client
        .from("room_players")
        .update({
            display_name: getRequiredUserDisplayName(user),
            last_active_at: new Date().toISOString(),
        })
        .eq("room_code", roomCode)
        .eq("user_id", user.id)
        .eq("is_active", true);
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
        throw error;
    }

    if (data === "room_not_found") {
        throw new Error("Room not found.");
    }

    if (data === "forbidden") {
        throw new Error("Only the host can start the game.");
    }

    if (data === "invalid_dealer_order") {
        throw new Error("Dealer order must include each current player exactly once.");
    }
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
            (payload) => {
                onRoomEvent({
                    ...payload,
                    sourceTable: "rooms",
                });
            },
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
                    onRoomEvent({
                        ...payload,
                        sourceTable: "rooms",
                    });
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
            (payload) => {
                onRoomEvent({
                    ...payload,
                    sourceTable: "room_players",
                });
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
            (payload) => {
                onRoomEvent({
                    ...payload,
                    sourceTable: "room_players",
                });
            },
        )
        .on(
            "postgres_changes",
            {
                event: "DELETE",
                schema: "public",
                table: "room_players",
            },
            (payload) => {
                if ((payload.old?.room_id || payload.new?.room_id) === roomId) {
                    onRoomEvent({
                        ...payload,
                        sourceTable: "room_players",
                    });
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
