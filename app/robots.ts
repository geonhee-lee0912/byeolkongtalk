import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/mypage",
          "/mypage/",
          "/readings",
          "/concern",
          "/saju/reading",
          "/saju/result",
          "/tarot/draw",
          "/tarot/reading",
          "/tarot/result",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
