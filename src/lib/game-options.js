export const GAME_OPTIONS = [
    {
        key: "Black Witch",
        imageSrc: "/BlackBitch/BB_Cover.png",
        imageAlt: "Black Witch cover",
        description: "Create a Black Witch room.",
    },
    {
        key: "Baseball",
        imageSrc: "/Baseball/Baseball_Cover.png",
        imageAlt: "Baseball cover",
        description: "Create a Baseball room.",
    },
];

export function toGameSlug(gameName) {
    return String(gameName || "")
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");
}

export function getCalculatorGameUrl(gameName) {
    return `/calculator/${toGameSlug(gameName)}`;
}
