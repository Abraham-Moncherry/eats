import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "eats",
    short_name: "eats",
    description: "A simple daily calorie and protein tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#f6f5f0",
    icons: [
      { src: "/eats-logo-dark.png", sizes: "1254x1254", type: "image/png", purpose: "any" },
    ],
  };
}
