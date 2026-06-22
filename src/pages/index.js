import { useEffect, useState } from "react";
import { Manrope, Sora } from "next/font/google";
import { useRouter } from "next/router";
import {
    DISPLAY_NAME_STORAGE_KEY,
    formatRoomCode,
    getActiveRoomForCurrentUser,
    getCurrentUser,
    joinRoomByCode,
    signInOrUpdateAnonymousUser,
    syncAnonymousActivity,
} from "@/lib/supabase-browser";

const headingFont = Sora({
    subsets: ["latin"],
    weight: ["700", "800"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["500", "700", "800"],
});

function NewRoomIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="12" cy="12" r="9" fill="rgba(255,255,255,0.95)" />
            <path
                d="M12 8v8M8 12h8"
                stroke="#FF8B3D"
                strokeWidth="2.4"
                strokeLinecap="round"
            />
        </svg>
    );
}

function JoinRoomIcon() {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="10" cy="8" r="3.5" fill="rgba(255,255,255,0.95)" />
            <path
                d="M4.75 17.25c.7-2.67 2.89-4.25 5.25-4.25s4.55 1.58 5.25 4.25"
                fill="rgba(255,255,255,0.95)"
            />
            <path
                d="M18 7.5v5M15.5 10h5"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function ActionCard({
    title,
    bgClass,
    shadowClass,
    children,
    disabled,
    isLoading,
    onClick,
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`${bodyFont.className} group flex min-h-40 flex-1 flex-col items-center justify-center gap-4 rounded-[28px] px-8 py-10 text-center text-white transition duration-200 ease-out ${bgClass} ${shadowClass} ${disabled ? "cursor-not-allowed opacity-55" : "hover:-translate-y-1 hover:scale-[1.01]"}`}
        >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition group-hover:bg-white/15">
                {children}
            </span>
            <span className="text-2xl font-extrabold tracking-[-0.03em]">
                {isLoading ? "Starting..." : title}
            </span>
        </button>
    );
}

function formatStatus(user, displayName) {
    const resolvedName = displayName || user?.user_metadata?.display_name;

    if (!user || !resolvedName) {
        return "Choose a display name to continue.";
    }

    return `Signed in as ${resolvedName}.`;
}

function getGameUrl(gameName, roomId) {
    return `/game/${encodeURIComponent(gameName)}/${roomId}`;
}

export default function Home() {
    const router = useRouter();
    const [displayName, setDisplayName] = useState("");
    const [roomCode, setRoomCode] = useState("");
    const [sessionUser, setSessionUser] = useState(null);
    const [status, setStatus] = useState("Checking saved player info...");
    const [isWorking, setIsWorking] = useState(false);
    const [activeAction, setActiveAction] = useState("");

    useEffect(() => {
        let isMounted = true;

        async function restoreSession() {
            const rememberedName =
                window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || "";

            if (isMounted) {
                setDisplayName(rememberedName);
            }

            try {
                const user = await getCurrentUser();

                if (!isMounted) {
                    return;
                }

                const metadataName = user?.user_metadata?.display_name || "";
                const resolvedName = rememberedName || metadataName;

                if (resolvedName) {
                    window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, resolvedName);
                    setDisplayName(resolvedName);
                }

                setSessionUser(user);
                setStatus(formatStatus(user, resolvedName));

                if (user) {
                    const activeRoom = await getActiveRoomForCurrentUser();

                    if (!isMounted) {
                        return;
                    }

                    if (activeRoom?.status === "in_game") {
                        await router.replace(
                            getGameUrl(activeRoom.selected_game, activeRoom.id),
                        );
                        return;
                    }

                    if (activeRoom?.room_code) {
                        await router.replace(`/lobby?code=${activeRoom.room_code}`);
                        return;
                    }
                }

                if (user && resolvedName) {
                    const syncResult = await syncAnonymousActivity(resolvedName);

                    if (!isMounted || !syncResult.user) {
                        return;
                    }

                    setSessionUser(syncResult.user);
                    setStatus(formatStatus(syncResult.user, resolvedName));
                }
            } catch (error) {
                if (isMounted) {
                    setStatus(error.message || "Unable to restore your saved player info.");
                }
            }
        }

        void restoreSession();

        return () => {
            isMounted = false;
        };
    }, [router]);

    async function handleRoomAction(actionLabel) {
        const trimmedDisplayName = displayName.trim();
        const trimmedRoomCode = formatRoomCode(roomCode);

        if (!trimmedDisplayName) {
            setStatus("Enter a display name before starting.");
            return;
        }

        if (actionLabel === "join" && trimmedRoomCode.length !== 4) {
            setStatus("Enter the 4-character room code to join.");
            return;
        }

        setIsWorking(true);
        setActiveAction(actionLabel);
        setStatus("Saving your anonymous player profile...");

        try {
            window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, trimmedDisplayName);

            const { user, isNewUser } = await signInOrUpdateAnonymousUser(
                trimmedDisplayName,
            );

            setSessionUser(user);
            setStatus(
                isNewUser
                    ? `${trimmedDisplayName} is ready. Anonymous login created and remembered.`
                    : `${trimmedDisplayName} is ready. Activity timestamp refreshed.`,
            );

            if (actionLabel === "new") {
                await router.push("/lobby?mode=select");
                return;
            }

            if (actionLabel === "join") {
                const room = await joinRoomByCode(trimmedRoomCode);
                await router.push(`/lobby?code=${room.room_code}`);
            }
        } catch (error) {
            setStatus(error.message || "Unable to save your anonymous player profile.");
        } finally {
            setIsWorking(false);
            setActiveAction("");
        }
    }

    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] text-[#0b1f49]`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />

            <section className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-20 sm:px-10">
                <div className="flex w-full max-w-4xl flex-col items-center gap-8 text-center sm:gap-10">
                    <div className="space-y-4">
                        <p className="text-sm font-extrabold uppercase tracking-[0.45em] text-[#0b1f49]/45">
                            Board Game Scorekeeper
                        </p>
                        <h1
                            className={`${headingFont.className} text-6xl font-extrabold tracking-[-0.08em] text-[#081b47] sm:text-7xl md:text-8xl`}
                        >
                            Game On.
                        </h1>
                        <p className="mx-auto max-w-2xl text-base font-bold text-[#0b1f49]/65 sm:text-lg">
                            Start a room, invite the table, and keep every round score in one
                            place.
                        </p>
                    </div>

                    <div className="w-full max-w-3xl rounded-[30px] border border-white/65 bg-white/55 p-4 text-left shadow-[0_25px_60px_-30px_rgba(11,31,73,0.35)] backdrop-blur-xl sm:p-4">
                        <label
                            htmlFor="display-name"
                            className="text-sm font-extrabold uppercase tracking-[0.3em] text-[#0b1f49]/55"
                        >
                            Display Name
                        </label>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                                id="display-name"
                                name="display-name"
                                type="text"
                                autoComplete="off"
                                maxLength={32}
                                value={displayName}
                                onChange={(event) => setDisplayName(event.target.value)}
                                placeholder="Player one"
                                className="h-15 flex-1 rounded-[22px] border border-[#0b1f49]/10 bg-white/85 px-5 text-lg font-bold text-[#081b47] outline-none transition placeholder:text-[#0b1f49]/30 focus:border-[#13aea9]/55 focus:ring-4 focus:ring-[#13aea9]/15"
                            />
                        </div>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                                id="room-code"
                                name="room-code"
                                type="text"
                                autoComplete="off"
                                inputMode="text"
                                maxLength={4}
                                value={roomCode}
                                onChange={(event) => setRoomCode(formatRoomCode(event.target.value))}
                                placeholder="Room code"
                                className="h-15 flex-1 rounded-[22px] border border-[#0b1f49]/10 bg-white/85 px-5 text-lg font-bold uppercase tracking-[0.2em] text-[#081b47] outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-[#0b1f49]/30 focus:border-[#13aea9]/55 focus:ring-4 focus:ring-[#13aea9]/15"
                            />
                        </div>
                        {!sessionUser && status === "Choose a display name to continue." ? null : (
                            <p
                                aria-live="polite"
                                className="mt-3 text-sm font-extrabold text-[#0b1f49]/72"
                            >
                                {status}
                            </p>
                        )}
                    </div>

                    <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2 sm:gap-6">
                        <ActionCard
                            title="New Room"
                            bgClass="bg-[#ff9347]"
                            shadowClass="shadow-[0_22px_45px_-20px_rgba(255,147,71,0.85)]"
                            disabled={isWorking}
                            isLoading={activeAction === "new"}
                            onClick={() => handleRoomAction("new")}
                        >
                            <NewRoomIcon />
                        </ActionCard>

                        <ActionCard
                            title="Join Room"
                            bgClass="bg-[#13aea9]"
                            shadowClass="shadow-[0_22px_45px_-20px_rgba(19,174,169,0.82)]"
                            disabled={isWorking}
                            isLoading={activeAction === "join"}
                            onClick={() => handleRoomAction("join")}
                        >
                            <JoinRoomIcon />
                        </ActionCard>
                    </div>

                    <p className="text-sm font-extrabold uppercase tracking-[0.3em] text-[#0b1f49]/38">
                        Keep game night moving.
                    </p>
                </div>
            </section>
        </main>
    );
}
