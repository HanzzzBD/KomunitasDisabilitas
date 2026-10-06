import { describe, it, expect } from "vitest";
import { tujuanDeepLink } from "../src/navigation/deep-link";
import { tujuanStack } from "../src/navigation/tujuan-stack";
import { tujuanPush } from "../src/push/tujuan";
describe("employer routing", () => {
  it("company links and new-applicant push target the employer workspace", () => {
    expect(tujuanDeepLink("nawasena://employer")).toEqual({ layar: "Employer" });
    expect(tujuanStack({ layar: "Employer" }, "employer")).toEqual({ screen: "Employer" });
    expect(
      tujuanPush({
        notificationId: "01912345-1111-7000-8000-000000000001",
        type: "employer.lamaran_baru",
        applicationId: "01912345-1111-7000-8000-000000000002",
        jobId: "01912345-1111-7000-8000-000000000003",
      }),
    ).toEqual({ layar: "Employer" });
  });
  it("employer notifications use its registered stack and private seeker links return to work", () => {
    expect(tujuanStack({ layar: "Notifikasi" }, "employer")).toEqual({ screen: "Notifikasi" });
    expect(tujuanStack({ layar: "LamaranDetail", id: "private-seeker-id" }, "employer")).toEqual({
      screen: "Employer",
    });
  });
  it("a seeker can reach self enrollment through the profile stack", () => {
    expect(tujuanStack({ layar: "Employer" }, "seeker")).toEqual({
      screen: "Profil",
      params: { screen: "Employer", initial: false },
    });
  });
});
