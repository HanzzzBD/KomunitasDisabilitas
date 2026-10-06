import { useKlienApi } from "../app/klien-api.js";
import { DasborMetrik } from "../features/admin/metrik-dasbor.js";
export function AdminAnalytics() {
  return <DasborMetrik klien={useKlienApi()} />;
}
