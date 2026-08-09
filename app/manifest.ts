import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daily Bite",
    short_name: "Daily Bite",
    description: "A simple daily calorie and protein tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f5f0",
    theme_color: "#f6f5f0",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
