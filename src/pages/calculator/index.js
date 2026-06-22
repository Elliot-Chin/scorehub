import Image from "next/image";
import { Manrope, Sora } from "next/font/google";
import { useRouter } from "next/router";
import { GAME_OPTIONS, getCalculatorGameUrl } from "@/lib/game-options";

const headingFont = Sora({
    subsets: ["latin"],
    weight: ["700", "800"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["500", "700", "800"],
});

const CALCULATOR_OPTIONS = GAME_OPTIONS.map((game) => ({
    ...game,
    description:
        game.key === "Black Bitch"
            ? "Open the Black Bitch calculator."
            : game.key === "Baseball"
              ? "Open the Baseball column calculator."
              : `${game.key} calculator coming soon.`,
    isAvailable: ["Black Bitch", "Baseball"].includes(game.key),
}));

function GameCard({ game, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!game.isAvailable}
            className="overflow-hidden rounded-[32px] bg-[#081018] text-left text-white shadow-[0_28px_60px_-28px_rgba(8,16,24,0.9)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-55"
        >
            <div className="relative aspect-[4/5] w-full">
                <Image
                    src={game.imageSrc}
                    alt={game.imageAlt}
                    fill
                    priority
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#081018] via-[#081018]/30 to-transparent" />
                {!game.isAvailable ? (
                    <div className="absolute right-4 top-4 rounded-full bg-white/16 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-white backdrop-blur-sm">
                        Soon
                    </div>
                ) : null}
            </div>
            <div className="space-y-3 p-6">
                <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-white/55">
                    Calculator
                </p>
                <h2
                    className={`${headingFont.className} text-3xl font-extrabold tracking-[-0.05em]`}
                >
                    {game.key}
                </h2>
                <p className="text-sm font-bold leading-6 text-white/72">{game.description}</p>
            </div>
        </button>
    );
}

export default function CalculatorSelectorPage() {
    const router = useRouter();

    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] px-6 py-10 text-[#081b47] sm:px-10`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />

            <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 mb-10">
                <header className="flex flex-col gap-3 rounded-[30px] border border-white/70 bg-white/70 p-6 shadow-[0_25px_60px_-30px_rgba(11,31,73,0.25)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-extrabold uppercase tracking-[0.32em] text-[#081b47]/45">
                            Calculator
                        </p>
                        <h1
                            className={`${headingFont.className} text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl`}
                        >
                            Pick a game.
                        </h1>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push("/")}
                        className="rounded-full bg-[#081b47] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.2em] text-white transition hover:bg-[#10285f]"
                    >
                        Back Home
                    </button>
                </header>

                <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {CALCULATOR_OPTIONS.map((game) => (
                        <GameCard
                            key={game.key}
                            game={game}
                            onClick={() => router.push(getCalculatorGameUrl(game.key))}
                        />
                    ))}
                </section>
            </div>
        </main>
    );
}
