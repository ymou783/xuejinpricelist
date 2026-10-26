import type { CategoryId, ImageAsset, Poster } from "../catalog";
export type PosterStatus = "draft" | "published" | "offline";
export const statusLabels = { draft: "草稿", published: "已发布", offline: "已下架" };
export interface ManagedPoster { draft: Poster; published?: Poster; status: PosterStatus; version: string; updatedAt: string }
export interface PosterRow { id: string; title: string; category: CategoryId; isNew: boolean; status: PosterStatus; image?: ImageAsset; hasChanges: boolean; version: string; updatedAt: string; position: number }
export interface PosterPage { items: PosterRow[]; total: number; counts: Record<"all" | CategoryId, number>; page: number; pageSize: number; pages: number; revision: string }
export interface BatchResult { succeeded: string[]; failed: { id: string; title: string; error: string }[] }
