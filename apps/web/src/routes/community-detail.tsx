import { useLocation, useParams } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { DetailRuang } from "../features/community/detail-ruang.js";
import { dariParam, keParam } from "../features/community/filter-url.js";

export function CommunityDetail() {
  const klien = useKlienApi();
  const { slug = "" } = useParams<{ slug: string }>();
  const location = useLocation();
  const value = (location.state as { asal?: unknown } | null)?.asal;
  const filter =
    typeof value === "string" && value.startsWith("?")
      ? keParam(dariParam(new URLSearchParams(value))).toString()
      : "";
  return <DetailRuang klien={klien} slug={slug} asal={filter ? `?${filter}` : ""} />;
}
