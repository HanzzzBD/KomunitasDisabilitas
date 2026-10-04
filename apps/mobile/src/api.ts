// Klien API mobile. Paket `@nawasena/api-client` (yang menarik `@nawasena/schemas`)
// dipakai apa adanya — tidak ada patch khusus mobile (AC PR-088).
//
// Sesi (access token + refresh lewat SecureStore) disambungkan di PR-090.
import { createApiClient } from "@nawasena/api-client";

import { apiBaseUrl } from "./config";

export const apiClient = createApiClient({ baseUrl: apiBaseUrl() });
