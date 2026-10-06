import { communityTypeSchema, type CommunityType } from "@nawasena/schemas";

export interface FilterCommunity {
  type?: CommunityType;
  city?: string;
}

export function dariParam(param: URLSearchParams): FilterCommunity {
  const type = communityTypeSchema.safeParse(param.get("jenis"));
  const city = param.get("kota")?.trim().slice(0, 120) ?? "";
  return {
    ...(type.success ? { type: type.data } : {}),
    ...(city ? { city } : {}),
  };
}

export function keParam(filter: FilterCommunity): URLSearchParams {
  const param = new URLSearchParams();
  if (filter.type) param.set("jenis", filter.type);
  if (filter.city?.trim()) param.set("kota", filter.city.trim());
  return param;
}
