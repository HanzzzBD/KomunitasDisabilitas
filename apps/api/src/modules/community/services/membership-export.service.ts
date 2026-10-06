import type { ExportContributor } from "../../users/services/export.service.js";
import type { CommunityRepository } from "../repositories/community.repository.js";
import { memberResponse } from "./community.service.js";
export function createCommunityMembershipExport(
  repo: Pick<CommunityRepository, "exportMemberships">,
): ExportContributor {
  return {
    bagian: "communityMemberships",
    async kumpulkan(userId) {
      return (await repo.exportMemberships(userId)).map(memberResponse);
    },
  };
}
