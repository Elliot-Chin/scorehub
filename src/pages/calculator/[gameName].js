import { useRouter } from "next/router";
import { toGameSlug } from "@/lib/game-options";
import { GameCalculatorPage, supportsCalculatorGame } from "@/components/game-calculator";

export default function CalculatorGamePage() {
    const router = useRouter();
    const gameName =
        typeof router.query.gameName === "string"
            ? decodeURIComponent(router.query.gameName)
            : "";
    const gameSlug = toGameSlug(gameName);

    if (!router.isReady) {
        return null;
    }

    return <GameCalculatorPage gameName={supportsCalculatorGame(gameSlug) ? gameSlug : gameName} />;
}
