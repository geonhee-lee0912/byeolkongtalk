import type { MetadataRoute } from "next";
import tagContent from "@/data/seo/tag-content.json";
import spreadContent from "@/data/seo/spread-content.json";
import cardContent from "@/data/seo/card-content.json";
import { buildSpreadSlug } from "@/lib/seo/spread-slugs";
import type { SpreadType } from "@/lib/tarot/spreads";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://byeolkongtalk.com";
  const lastModified = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/refund`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const hubEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/guide`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      // "daily" 가 아니다 — 뽑기가 클라이언트 랜덤이라 서버가 뱉는 문서 자체는
      // 우리가 고칠 때만 바뀐다. 유저에게 매일 다른 카드가 보이는 것과
      // 문서가 매일 바뀌는 것은 다른 얘기다.
      url: `${baseUrl}/free/daily-card`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
  // 인덱스 페이지는 발행분이 있을 때만 등재 — 빈 목록 페이지를 색인시키면 thin page
  if (Object.keys(spreadContent).length > 0) {
    hubEntries.push({
      url: `${baseUrl}/guide/spreads`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  if (Object.keys(cardContent).length > 0) {
    hubEntries.push({
      url: `${baseUrl}/guide/tarot-cards`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
  }

  const contentEntries: MetadataRoute.Sitemap = [
    ...Object.keys(tagContent).map((slug) => ({
      url: `${baseUrl}/guide/themes/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...Object.keys(spreadContent).map((key) => ({
      url: `${baseUrl}/guide/spreads/${buildSpreadSlug(key as SpreadType)}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...Object.keys(cardContent).map((slug) => ({
      url: `${baseUrl}/guide/tarot-cards/${slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return [...staticEntries, ...hubEntries, ...contentEntries];
}
