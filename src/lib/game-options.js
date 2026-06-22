export const GAME_OPTIONS = [
    {
        key: "Black Bitch",
        imageSrc: "/BlackBitch/BB_Cover.png",
        imageAlt: "Black Bitch cover",
        description: "Create a Black Bitch room.",
    },
    {
        key: "Baseball",
        imageSrc: "/baseball/Baseball_Cover.png",
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
