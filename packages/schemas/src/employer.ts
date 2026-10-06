import { z } from "zod";
import { idSchema, successEnvelopeSchema } from "./common.js";
import { companyPublicSchema, createCompanySchema, updateCompanySchema } from "./companies.js";

/** Recruitment approval is separate from the public inclusivity badge. */
export const employerCompanySchema = companyPublicSchema
  .extend({
    recruitmentStatus: z.enum(["pending", "approved", "rejected"]),
    memberRole: z.enum(["owner", "recruiter"]),
  })
  .openapi({ ref: "EmployerCompany" });
export type EmployerCompany = z.infer<typeof employerCompanySchema>;
export const employerCompaniesResponseSchema = successEnvelopeSchema(
  z.array(employerCompanySchema),
);
export const employerCompanyResponseSchema = successEnvelopeSchema(employerCompanySchema);
export const registerEmployerSchema = createCompanySchema;
export const updateEmployerCompanySchema = updateCompanySchema.omit({ inclusivityStatus: true });
export const employerApprovalSchema = z
  .object({ status: z.enum(["approved", "rejected"]) })
  .strict();
export const employerCompanyParamsSchema = z.object({ id: idSchema }).strict();
