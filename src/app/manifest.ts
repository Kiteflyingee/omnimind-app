import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "AiMin",
        short_name: "AiMin",
        description: "AI-native Memory System",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#000000",
        icons: [
            {
                src: "/avatars/aimin.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/avatars/aimin.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}
