import { useMemo, useState } from "react";
import Link from "next/link";
import { Manrope, Sora } from "next/font/google";

const headingFont = Sora({
    subsets: ["latin"],
    weight: ["700", "800"],
});

const bodyFont = Manrope({
    subsets: ["latin"],
    weight: ["500", "700", "800"],
});

const BLACK_BITCH_CARDS = [
    { id: "rank-A", label: "Ace", rank: "A", points: 15, tone: "peach" },
    { id: "rank-2", label: "Two", rank: "2", points: 20, tone: "peach" },
    { id: "rank-3", label: "Three", rank: "3", points: 5, tone: "mint" },
    { id: "rank-4", label: "Four", rank: "4", points: 5, tone: "mint" },
    { id: "rank-5", label: "Five", rank: "5", points: 5, tone: "mint" },
    { id: "rank-6", label: "Six", rank: "6", points: 5, tone: "mint" },
    { id: "rank-7", label: "Seven", rank: "7", points: 5, tone: "mint" },
    { id: "rank-8", label: "Eight", rank: "8", points: 5, tone: "mint" },
    { id: "rank-9", label: "Nine", rank: "9", points: 5, tone: "mint" },
    { id: "rank-10", label: "Ten", rank: "10", points: 10, tone: "sky" },
    { id: "rank-J", label: "Jack", rank: "J", points: 10, tone: "sky" },
    { id: "rank-Q", label: "Queen", rank: "Q", points: 10, tone: "sky" },
    { id: "rank-K", label: "King", rank: "K", points: 10, tone: "sky" },
    { id: "black-bitch", label: "Black Bitch", rank: "BB", points: 100, tone: "navy" },
    { id: "joker", label: "Joker", rank: "Joker", points: 50, tone: "gold" },
];

const BASEBALL_CARDS = [
    { id: "baseball-A", label: "Ace", rank: "A", points: 1, tone: "peach" },
    { id: "baseball-2", label: "Two", rank: "2", points: 2, tone: "mint" },
    { id: "baseball-3", label: "Three", rank: "3", points: 3, tone: "mint" },
    { id: "baseball-4", label: "Four", rank: "4", points: 4, tone: "mint" },
    { id: "baseball-5", label: "Five", rank: "5", points: 5, tone: "mint" },
    { id: "baseball-6", label: "Six", rank: "6", points: 6, tone: "mint" },
    { id: "baseball-7", label: "Seven", rank: "7", points: 7, tone: "mint" },
    { id: "baseball-8", label: "Eight", rank: "8", points: 8, tone: "mint" },
    { id: "baseball-9", label: "Nine", rank: "9", points: 9, tone: "mint" },
    { id: "baseball-10", label: "Ten", rank: "10", points: 10, tone: "sky" },
    { id: "baseball-J", label: "Jack", rank: "J", points: 10, tone: "sky" },
    { id: "baseball-Q", label: "Queen", rank: "Q", points: 10, tone: "sky" },
    { id: "baseball-K", label: "King", rank: "K", points: 0, tone: "navy" },
    { id: "baseball-joker", label: "Joker", rank: "Joker", points: -2, tone: "gold" },
];

const TONE_STYLES = {
    peach: {
        accent: "#ff9347",
        accentSoft: "#f8d8c1",
        ink: "#081b47",
        badgeBg: "#ffe0cb",
        badgeText: "#cb6f2e",
    },
    mint: {
        accent: "#13aea9",
        accentSoft: "#cbeee9",
        ink: "#081b47",
        badgeBg: "#d8f4ef",
        badgeText: "#157d79",
    },
    sky: {
        accent: "#4f7cff",
        accentSoft: "#d5e1ff",
        ink: "#081b47",
        badgeBg: "#dfe8ff",
        badgeText: "#4464c9",
    },
    navy: {
        accent: "#081b47",
        accentSoft: "#cad8ff",
        ink: "#081b47",
        badgeBg: "#dbe5ff",
        badgeText: "#385a9d",
    },
    gold: {
        accent: "#ff9347",
        accentSoft: "#ffe0b8",
        ink: "#081b47",
        badgeBg: "#ffe4c7",
        badgeText: "#bf6a22",
    },
};

const BASEBALL_COLUMN_SLOTS = [
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
];

function Dot({ cx, cy, r, fill }) {
    return <circle cx={cx} cy={cy} r={r} fill={fill} />;
}

function renderRankIcon(card, style) {
    const fill = style.accent;
    const soft = style.accentSoft;
    const ink = style.ink;

    switch (card.rank) {
        case "A":
            return (
                <>
                    <path d="M76 44L108 108H93L86 93H66L59 108H44L76 44Z" fill={fill} />
                    <path d="M72 81H80L76 69L72 81Z" fill="white" />
                    <rect x="60" y="112" width="32" height="8" rx="4" fill={soft} />
                </>
            );
        case "2":
            return (
                <>
                    <rect x="48" y="56" width="22" height="42" rx="11" fill={soft} />
                    <rect x="82" y="56" width="22" height="42" rx="11" fill={fill} />
                    <path d="M68 76C72 68 80 64 87 64" stroke={ink} strokeWidth="7" strokeLinecap="round" />
                    <path d="M84 78C80 86 72 90 65 90" stroke={ink} strokeWidth="7" strokeLinecap="round" />
                </>
            );
        case "3":
            return (
                <>
                    <Dot cx={76} cy={60} r={12} fill={fill} />
                    <Dot cx={58} cy={90} r={12} fill={soft} />
                    <Dot cx={94} cy={90} r={12} fill={fill} />
                    <path d="M58 112H94" stroke={soft} strokeWidth="10" strokeLinecap="round" />
                </>
            );
        case "4":
            return (
                <>
                    <rect x="48" y="54" width="20" height="20" rx="6" fill={fill} />
                    <rect x="84" y="54" width="20" height="20" rx="6" fill={soft} />
                    <rect x="48" y="90" width="20" height="20" rx="6" fill={soft} />
                    <rect x="84" y="90" width="20" height="20" rx="6" fill={fill} />
                </>
            );
        case "5":
            return (
                <>
                    <polygon points="76,48 88,72 114,76 95,94 100,120 76,107 52,120 57,94 38,76 64,72" fill={fill} />
                    <circle cx="76" cy="84" r="10" fill="white" />
                </>
            );
        case "6":
            return (
                <>
                    <polygon points="76,48 102,63 102,93 76,108 50,93 50,63" fill={soft} />
                    <polygon points="76,58 92,67 92,89 76,98 60,89 60,67" fill={fill} />
                    <circle cx="76" cy="78" r="6" fill="white" />
                </>
            );
        case "7":
            return (
                <>
                    <path d="M48 56H104L69 112H53L82 68H48V56Z" fill={fill} />
                    <circle cx="95" cy="103" r="8" fill={soft} />
                </>
            );
        case "8":
            return (
                <>
                    <circle cx="76" cy="65" r="19" fill={fill} />
                    <circle cx="76" cy="95" r="24" fill={soft} />
                    <circle cx="76" cy="65" r="7" fill="white" />
                    <circle cx="76" cy="95" r="8" fill="white" />
                </>
            );
        case "9":
            return (
                <>
                    <Dot cx={58} cy={58} r={8} fill={fill} />
                    <Dot cx={76} cy={58} r={8} fill={soft} />
                    <Dot cx={94} cy={58} r={8} fill={fill} />
                    <Dot cx={58} cy={78} r={8} fill={soft} />
                    <Dot cx={76} cy={78} r={8} fill={fill} />
                    <Dot cx={94} cy={78} r={8} fill={soft} />
                    <Dot cx={58} cy={98} r={8} fill={fill} />
                    <Dot cx={76} cy={98} r={8} fill={soft} />
                    <Dot cx={94} cy={98} r={8} fill={fill} />
                </>
            );
        case "10":
            return (
                <>
                    <circle cx="56" cy="58" r="9" fill={fill} />
                    <circle cx="76" cy="58" r="9" fill={soft} />
                    <circle cx="96" cy="58" r="9" fill={fill} />
                    <circle cx="56" cy="78" r="9" fill={soft} />
                    <circle cx="76" cy="78" r="9" fill={fill} />
                    <circle cx="96" cy="78" r="9" fill={soft} />
                    <circle cx="56" cy="98" r="9" fill={fill} />
                    <circle cx="76" cy="98" r="9" fill={soft} />
                    <circle cx="96" cy="98" r="9" fill={fill} />
                    <rect x="71" y="109" width="10" height="18" rx="5" fill={soft} />
                </>
            );
        case "J":
            return (
                <>
                    <path d="M52 54H100V66H83V106C83 118 76 124 64 124C58 124 52 122 47 118L52 108C55 110 59 111 62 111C68 111 70 108 70 102V66H52V54Z" fill={fill} />
                    <rect x="90" y="88" width="16" height="16" rx="5" fill={soft} />
                </>
            );
        case "Q":
            return (
                <>
                    <circle cx="76" cy="78" r="28" fill={soft} />
                    <circle cx="76" cy="78" r="17" fill="white" />
                    <path d="M94 96L104 106" stroke={fill} strokeWidth="8" strokeLinecap="round" />
                    <circle cx="63" cy="52" r="6" fill={fill} />
                    <circle cx="76" cy="46" r="6" fill={fill} />
                    <circle cx="89" cy="52" r="6" fill={fill} />
                </>
            );
        case "K":
            return (
                <>
                    <path d="M50 48H63V80L92 48H108L84 74L110 108H94L75 83L63 96V108H50V48Z" fill={fill} />
                    <rect x="88" y="112" width="18" height="8" rx="4" fill={soft} />
                </>
            );
        case "BB":
            return (
                <>
                    <path
                        d="M76 52C76 43 82 37 90 37C98 37 105 43 105 53C105 60 101 66 94 72C89 76 84 80 82 87H93C96 87 99 90 99 94C99 98 96 101 92 101H60C56 101 53 98 53 94C53 90 56 87 60 87H70C68 80 63 76 58 72C51 66 47 60 47 53C47 43 54 37 62 37C70 37 76 43 76 52Z"
                        fill={fill}
                    />
                    <path d="M64 54L71 47L76 54L81 47L88 54V42H64V54Z" fill={fill} />
                    <rect x="53" y="111" width="46" height="10" rx="5" fill={fill} opacity="0.14" />
                </>
            );
        case "Joker":
            return (
                <>
                    <path
                        d="M44 95C51 94 57 90 61 84C64 90 69 94 76 96C82 94 88 90 91 84C95 90 101 94 108 95L100 109H52L44 95Z"
                        fill={fill}
                    />
                    <path d="M61 84L55 63L70 70L76 48L82 70L97 63L91 84" fill={fill} />
                    <circle cx="55" cy="62" r="5" fill={ink} />
                    <circle cx="76" cy="48" r="5" fill={ink} />
                    <circle cx="97" cy="62" r="5" fill={ink} />
                    <rect x="64" y="111" width="24" height="9" rx="4.5" fill={fill} opacity="0.2" />
                </>
            );
        default:
            return null;
    }
}

function CardArt({ card, compact = false }) {
    const style = TONE_STYLES[card.tone];
    const titleY = compact ? 30 : 38;
    const artTranslateY = compact ? 24 : 16;
    const scoreY = compact ? 150 : 176;
    const scoreTextY = compact ? 166 : 192;

    return (
        <svg viewBox="0 0 152 220" className="h-auto w-full" aria-hidden="true">
            <rect x="10" y="10" width="132" height="200" rx="28" fill="white" />
            <text
                x="76"
                y={titleY}
                textAnchor="middle"
                fontSize={compact ? 10 : 11}
                fontWeight="800"
                fill="#50637f"
                fontFamily="Arial, sans-serif"
                letterSpacing="1.2"
            >
                {card.label.toUpperCase()}
            </text>
            <g transform={`translate(0 ${artTranslateY})`}>{renderRankIcon(card, style)}</g>
            <rect x="24" y={scoreY} width="54" height="24" rx="12" fill={style.badgeBg} />
            <text
                x="51"
                y={scoreTextY}
                textAnchor="middle"
                fontSize="14"
                fontWeight="800"
                fill={style.badgeText}
                fontFamily="Arial, sans-serif"
            >
                {card.points > 0 ? `+${card.points}` : String(card.points)}
            </text>
        </svg>
    );
}

function BlackBitchScoreCard({ card, onClick }) {
    return (
        <button
            type="button"
            onClick={() => onClick(card.points)}
            className="rounded-[30px] bg-white/78 p-2 shadow-[0_22px_45px_-28px_rgba(11,31,73,0.34)] transition hover:-translate-y-1 hover:shadow-[0_28px_55px_-28px_rgba(19,174,169,0.34)]"
        >
            <CardArt card={card} />
        </button>
    );
}

function BaseballSlot({ card, slotIndex, onClick }) {
    return (
        <button
            type="button"
            onClick={() => onClick(slotIndex)}
            className="rounded-[28px] bg-white/82 p-2 text-left shadow-[0_20px_45px_-30px_rgba(11,31,73,0.28)] transition hover:-translate-y-1 hover:shadow-[0_26px_55px_-30px_rgba(19,174,169,0.34)]"
        >
            {card ? (
                <CardArt card={card} compact />
            ) : (
                <div className="flex aspect-[152/220] flex-col items-center justify-center rounded-[24px] bg-[#f7faf9] text-center">
                    <span className="text-5xl font-light text-[#13aea9]/45">+</span>
                    <span className="mt-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                        Pick Card
                    </span>
                </div>
            )}
        </button>
    );
}

function BaseballCardModal({ cards, onChooseCard, onClose, onClearCard, hasSelectedCard }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#081b47]/38 px-4 py-6 backdrop-blur-sm">
            <div className="w-full max-w-5xl rounded-[32px] border border-white/70 bg-white/88 p-5 shadow-[0_25px_60px_-28px_rgba(8,27,71,0.45)] backdrop-blur-xl sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-extrabold uppercase tracking-[0.26em] text-[#081b47]/45">
                            Select Card
                        </p>
                        <h2
                            className={`${headingFont.className} mt-1 text-3xl font-extrabold tracking-[-0.05em] text-[#081b47]`}
                        >
                            Baseball Slot
                        </h2>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        {hasSelectedCard ? (
                            <button
                                type="button"
                                onClick={onClearCard}
                                className="rounded-full border border-[#081b47]/12 bg-white px-5 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#081b47] transition hover:bg-[#f8fafc]"
                            >
                                Clear Slot
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full bg-[#081b47] px-5 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                        >
                            Close
                        </button>
                    </div>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                    {cards.map((card) => (
                        <button
                            key={card.id}
                            type="button"
                            onClick={() => onChooseCard(card.id)}
                            className="rounded-[24px] bg-white p-2 shadow-[0_18px_40px_-30px_rgba(11,31,73,0.3)] transition hover:-translate-y-1"
                        >
                            <CardArt card={card} compact />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function UnsupportedCalculator({ gameName }) {
    return (
        <div className={`${bodyFont.className} relative mx-auto flex min-h-screen max-w-3xl items-center justify-center`}>
            <section className="w-full rounded-[32px] border border-white/70 bg-white/75 p-8 text-center shadow-[0_25px_60px_-30px_rgba(11,31,73,0.3)] backdrop-blur-xl">
                <p className="text-sm font-extrabold uppercase tracking-[0.3em] text-[#081b47]/45">
                    Calculator
                </p>
                <h1
                    className={`${headingFont.className} mt-3 text-4xl font-extrabold tracking-[-0.06em]`}
                >
                    {gameName || "This game"} is not ready yet.
                </h1>
                <p className="mt-4 text-base font-bold text-[#0b1f49]/65">
                    Only the Black Bitch and Baseball calculators are active right now.
                </p>
                <div className="mt-8 flex justify-center">
                    <Link
                        href="/calculator"
                        className="rounded-full bg-[#081b47] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                    >
                        Back to Games
                    </Link>
                </div>
            </section>
        </div>
    );
}

function CalculatorShell({
    title,
    description,
    controls,
    sidebar,
    children,
    footerActions = null,
    hideBackLink = false,
}) {
    return (
        <div className={`${bodyFont.className} relative`}>
            <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 mb-10">
                <header className="rounded-[30px] border border-white/70 bg-white/72 p-6 shadow-[0_25px_60px_-30px_rgba(11,31,73,0.25)] backdrop-blur-xl">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <p className="text-sm font-extrabold uppercase tracking-[0.32em] text-[#081b47]/45">
                                Calculator
                            </p>
                            <h1
                                className={`${headingFont.className} text-4xl font-extrabold tracking-[-0.06em] sm:text-5xl`}
                            >
                                {title}
                            </h1>
                            <p className="max-w-2xl text-sm font-bold text-[#0b1f49]/65 sm:text-base">
                                {description}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                            {controls}
                            {hideBackLink ? null : (
                                <Link
                                    href="/calculator"
                                    className="inline-flex w-full items-center justify-center rounded-full bg-[#081b47] px-6 py-3 text-center text-base font-extrabold !text-white transition hover:bg-[#10285f] sm:w-auto sm:min-w-[9rem]"
                                >
                                    Back to Games
                                </Link>
                            )}
                        </div>
                    </div>
                </header>

                <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_25px_60px_-30px_rgba(11,31,73,0.25)] backdrop-blur-xl">
                        {sidebar}
                    </aside>
                    <div className="flex flex-col gap-4">
                        {children}
                        {footerActions}
                    </div>
                </section>
            </div>
        </div>
    );
}

function BlackBitchCalculator({ hideBackLink = false, onApplyScore = null }) {
    const [total, setTotal] = useState(0);
    const [deckBonusUsed, setDeckBonusUsed] = useState(false);

    return (
        <CalculatorShell
            hideBackLink={hideBackLink}
            title="Black Bitch"
            description="Tap any card to add its score. Standard cards ignore suit. Only Black Bitch and Joker are special."
            controls={
                <>
                    <button
                        type="button"
                        onClick={() => {
                            setTotal((currentTotal) => currentTotal + 100);
                            setDeckBonusUsed(true);
                        }}
                        disabled={deckBonusUsed}
                        className="rounded-full bg-[#ff9347] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#f6832e] disabled:cursor-not-allowed disabled:opacity-55"
                    >
                        Deck Bonus
                    </button>
                    <button
                        type="button"
                        onClick={() => setTotal(0)}
                        className="rounded-full border border-[#081b47]/12 bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#081b47] transition hover:bg-[#f8fafc]"
                    >
                        Reset Total
                    </button>
                </>
            }
            sidebar={
                <>
                    <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-[#081b47]/45">
                        Running Total
                    </p>
                    <div className="mt-4 rounded-[24px] bg-[#081b47] px-6 py-8 text-white shadow-[0_20px_45px_-28px_rgba(8,27,71,0.8)]">
                        <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/55">
                            Score
                        </p>
                        <p
                            className={`${headingFont.className} mt-3 text-6xl font-extrabold tracking-[-0.08em]`}
                        >
                            {total}
                        </p>
                    </div>
                    <div className="mt-4 rounded-[24px] bg-[#f7f9fb] p-4 text-sm font-bold text-[#50637f]">
                        Ace is 15. Two is 20. Three through nine are 5. Ten, Jack, Queen, and
                        King are 10. Black Bitch is 100. Joker is 50.
                    </div>
                </>
            }
            footerActions={
                onApplyScore ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => onApplyScore(total)}
                            className="rounded-full bg-[#081b47] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                        >
                            Add {total}
                        </button>
                    </div>
                ) : null
            }
        >
            <section className="grid grid-cols-3 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {BLACK_BITCH_CARDS.map((card) => (
                    <BlackBitchScoreCard
                        key={card.id}
                        card={card}
                        onClick={(points) => setTotal((currentTotal) => currentTotal + points)}
                    />
                ))}
            </section>
        </CalculatorShell>
    );
}

function getBaseballColumnScore(cardsInColumn) {
    const selectedCards = cardsInColumn.filter(Boolean);

    if (selectedCards.length === 0) {
        return 0;
    }

    if (selectedCards.length === 3) {
        const allSame = selectedCards.every((card) => card.id === selectedCards[0].id);

        if (allSame) {
            if (selectedCards[0].rank === "Joker") {
                return -6;
            }

            return 0;
        }
    }

    return selectedCards.reduce((sum, card) => sum + card.points, 0);
}

function BaseballCalculator({ hideBackLink = false, onApplyScore = null }) {
    const [slots, setSlots] = useState(Array(9).fill(null));
    const [selectedSlotIndex, setSelectedSlotIndex] = useState(null);

    const cardLookup = useMemo(
        () => new Map(BASEBALL_CARDS.map((card) => [card.id, card])),
        [],
    );
    const cardsInSlots = slots.map((cardId) => (cardId ? cardLookup.get(cardId) || null : null));
    const columnScores = BASEBALL_COLUMN_SLOTS.map((slotIndexes) =>
        getBaseballColumnScore(slotIndexes.map((slotIndex) => cardsInSlots[slotIndex])),
    );
    const totalScore = columnScores.reduce((sum, score) => sum + score, 0);

    function handleChooseCard(cardId) {
        if (selectedSlotIndex === null) {
            return;
        }

        setSlots((currentSlots) =>
            currentSlots.map((currentCardId, slotIndex) =>
                slotIndex === selectedSlotIndex ? cardId : currentCardId,
            ),
        );
        setSelectedSlotIndex(null);
    }

    function handleClearSlot() {
        if (selectedSlotIndex === null) {
            return;
        }

        setSlots((currentSlots) =>
            currentSlots.map((currentCardId, slotIndex) =>
                slotIndex === selectedSlotIndex ? null : currentCardId,
            ),
        );
        setSelectedSlotIndex(null);
    }

    return (
        <>
            <CalculatorShell
                hideBackLink={hideBackLink}
                title="Baseball"
                description="Tap a slot, choose a card, and track the three column totals plus the combined score."
                controls={
                    <button
                        type="button"
                        onClick={() => {
                            setSlots(Array(9).fill(null));
                            setSelectedSlotIndex(null);
                        }}
                        className="rounded-full border border-[#081b47]/12 bg-white px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-[#081b47] transition hover:bg-[#f8fafc]"
                    >
                        Reset Board
                    </button>
                }
                sidebar={
                    <>
                        <p className="text-sm font-extrabold uppercase tracking-[0.24em] text-[#081b47]/45">
                            Column Scores
                        </p>
                        <div className="mt-4 grid gap-3">
                            {columnScores.map((score, columnIndex) => (
                                <div
                                    key={`column-${columnIndex + 1}`}
                                    className="rounded-[22px] bg-[#f7f9fb] px-5 py-4"
                                >
                                    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#50637f]">
                                        Column {columnIndex + 1}
                                    </p>
                                    <p
                                        className={`${headingFont.className} mt-2 text-4xl font-extrabold tracking-[-0.06em] text-[#081b47]`}
                                    >
                                        {score}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 rounded-[24px] bg-[#081b47] px-6 py-8 text-white shadow-[0_20px_45px_-28px_rgba(8,27,71,0.8)]">
                            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/55">
                                Total
                            </p>
                            <p
                                className={`${headingFont.className} mt-3 text-6xl font-extrabold tracking-[-0.08em]`}
                            >
                                {totalScore}
                            </p>
                        </div>
                        <div className="mt-4 rounded-[24px] bg-[#f7f9fb] p-4 text-sm font-bold text-[#50637f]">
                            Ace is 1. King is 0. Two through ten use face value. Jack and Queen
                            are 10. Joker is -2. Three matching cards in a column score 0, except
                            three Jokers score -6.
                        </div>
                    </>
                }
                footerActions={
                    onApplyScore ? (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => onApplyScore(totalScore)}
                                className="rounded-full bg-[#081b47] px-6 py-3 text-sm font-extrabold uppercase tracking-[0.18em] text-white transition hover:bg-[#10285f]"
                            >
                                Add {totalScore}
                            </button>
                        </div>
                    ) : null
                }
            >
                <section className="rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_20px_45px_-30px_rgba(11,31,73,0.18)] sm:p-5">
                    <div className="grid grid-cols-3 gap-3 sm:gap-4">
                        {cardsInSlots.map((card, slotIndex) => (
                            <BaseballSlot
                                key={`slot-${slotIndex}`}
                                card={card}
                                slotIndex={slotIndex}
                                onClick={setSelectedSlotIndex}
                            />
                        ))}
                    </div>
                </section>
            </CalculatorShell>

            {selectedSlotIndex !== null ? (
                <BaseballCardModal
                    cards={BASEBALL_CARDS}
                    hasSelectedCard={Boolean(cardsInSlots[selectedSlotIndex])}
                    onChooseCard={handleChooseCard}
                    onClose={() => setSelectedSlotIndex(null)}
                    onClearCard={handleClearSlot}
                />
            ) : null}
        </>
    );
}

export function supportsCalculatorGame(gameName) {
    const normalizedGameName = String(gameName || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");

    return ["black-bitch", "baseball"].includes(normalizedGameName);
}

export function GameCalculator({ gameName, hideBackLink = false, onApplyScore = null }) {
    const gameSlug = String(gameName || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");

    if (gameSlug === "black-bitch") {
        return (
            <BlackBitchCalculator
                hideBackLink={hideBackLink}
                onApplyScore={onApplyScore}
            />
        );
    }

    if (gameSlug === "baseball") {
        return (
            <BaseballCalculator
                hideBackLink={hideBackLink}
                onApplyScore={onApplyScore}
            />
        );
    }

    return null;
}

export function GameCalculatorPage({ gameName }) {
    return (
        <main
            className={`${bodyFont.className} relative min-h-screen overflow-hidden bg-[#eef5f3] px-4 py-6 text-[#081b47] sm:px-6 sm:py-8`}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,217,190,0.95),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(188,231,230,0.85),_transparent_32%),radial-gradient(circle_at_bottom_center,_rgba(255,255,255,0.9),_transparent_50%)]" />
            <div className="pointer-events-none absolute left-[-7rem] top-[-7rem] h-64 w-64 rounded-full bg-[#ffd3b3]/70 blur-3xl" />
            <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-72 w-72 rounded-full bg-[#b8ece6]/60 blur-3xl" />
            {supportsCalculatorGame(gameName) ? (
                <GameCalculator gameName={gameName} />
            ) : (
                <UnsupportedCalculator gameName={gameName} />
            )}
        </main>
    );
}
