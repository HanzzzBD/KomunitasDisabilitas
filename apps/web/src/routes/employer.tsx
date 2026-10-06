import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { employerApi, ApiError, usersKeys } from "@nawasena/api-client";
import {
  ACCOMMODATION_NEEDS,
  tujuanStatusSah,
  type AccommodationNeed,
  type EmployerCompany,
  type JobAdmin,
  type ApplicationStatus,
  type ResumeContent,
} from "@nawasena/schemas";
import { Link } from "react-router";
import { useKlienApi } from "../app/klien-api.js";
import { Terlindungi } from "../shared/rute/terlindungi.js";
import { usePeranSesi } from "../shared/sesi/peran.js";
import { useTeks, type KunciTeks } from "../shared/i18n/index.js";
import { useJudulHalaman } from "../shared/judul-halaman.js";
import { idPenggunaSaatIni } from "../features/onboarding/identitas.js";
import "../features/employer/portal.css";

export function Employer() {
  return (
    <Terlindungi>
      <Portal />
    </Terlindungi>
  );
}
function Portal() {
  const t = useTeks();
  const client = useKlienApi();
  const qc = useQueryClient();
  const role = usePeranSesi();
  const sub = idPenggunaSaatIni();
  const key = ["employer", sub] as const;
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("employer.title") }));
  const [companyId, setCompanyId] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [applicationId, setApplicationId] = useState<string>();
  const [companyEdit, setCompanyEdit] = useState(false);
  const [jobEdit, setJobEdit] = useState<JobAdmin | "new">();
  const [cursor, setCursor] = useState<string>();
  const [previous, setPrevious] = useState<(string | undefined)[]>([]);
  const action = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: key }),
        qc.invalidateQueries({ queryKey: usersKeys.me() }),
      ]);
    },
  });
  const companies = useQuery({
    queryKey: [...key, "companies"],
    queryFn: () => employerApi.companies(client),
    enabled: role === "employer",
  });
  const company = companies.data?.find((c) => c.id === companyId) ?? companies.data?.[0];
  const jobs = useQuery({
    queryKey: [...key, "jobs", company?.id],
    queryFn: () => employerApi.jobs(client, company!.id),
    enabled: !!company,
  });
  const job = jobs.data?.find((j) => j.id === jobId);
  const applications = useQuery({
    queryKey: [...key, "applications", jobId, cursor],
    queryFn: () => employerApi.applications(client, jobId!, cursor),
    enabled: !!jobId && company?.recruitmentStatus === "approved",
  });
  const detail = useQuery({
    queryKey: [...key, "application", applicationId],
    queryFn: () => employerApi.application(client, applicationId!),
    enabled: !!applicationId,
  });
  const run = (fn: () => Promise<unknown>) => action.mutate(fn);
  const busy = action.isPending;
  const back = () => {
    setJobId(undefined);
    setApplicationId(undefined);
    setJobEdit(undefined);
    setCompanyEdit(false);
    setCursor(undefined);
    setPrevious([]);
    action.reset();
  };
  if (role === "admin")
    return (
      <p>
        <Link to="/admin/employers">{t("employer.review")}</Link>
      </p>
    );
  if (role === null || (role === "employer" && companies.isPending))
    return <p role="status">{t("employer.loading")}</p>;
  return (
    <div className="employer-portal">
      <header>
        <p className="text-sm font-semibold">Nawasena · Employer</p>
        <h1>{t("employer.title")}</h1>
        <p>{t("employer.intro")}</p>
      </header>
      {action.isError && (
        <p role="alert">
          {action.error instanceof ApiError ? action.error.message : t("employer.invalid")}
        </p>
      )}
      {action.isSuccess && <p role="status">{t("employer.saved")}</p>}
      {companies.isError ? (
        <>
          <p role="alert">{t("employer.error")}</p>
          <button onClick={() => void companies.refetch()}>{t("employer.retry")}</button>
        </>
      ) : !company ? (
        <section>
          <h2>{t("employer.register")}</h2>
          <p>{t("employer.empty")}</p>
          <p>{t("employer.registerInfo")}</p>
          <CompanyForm
            busy={busy}
            onSave={(body) =>
              run(async () => {
                const c = await employerApi.register(client, body);
                setCompanyId(c.id);
              })
            }
          />
        </section>
      ) : (
        <>
          <div className="employer-toolbar">
            <label>
              {t("employer.company")}
              <select
                value={company.id}
                onChange={(e) => {
                  back();
                  setCompanyId(e.target.value);
                }}
                disabled={busy}
              >
                {companies.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={back} disabled={busy}>
              {t("employer.back")}
            </button>
          </div>
          <section className="employer-company">
            <h2>{company.name}</h2>
            <p className="font-semibold">{t(`employer.${company.recruitmentStatus}`)}</p>
            {company.recruitmentStatus !== "approved" && <p>{t("employer.pendingInfo")}</p>}
            {company.memberRole === "owner" && (
              <button
                disabled={busy}
                onClick={() => {
                  back();
                  setCompanyEdit(true);
                }}
              >
                {t("employer.companyEdit")}
              </button>
            )}
          </section>
          {companyEdit ? (
            <CompanyForm
              key={company.id}
              value={company}
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  await employerApi.updateCompany(client, company.id, body);
                  setCompanyEdit(false);
                })
              }
            />
          ) : jobEdit ? (
            <JobForm
              key={jobEdit === "new" ? "new" : jobEdit.id}
              value={jobEdit === "new" ? undefined : jobEdit}
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  if (jobEdit === "new")
                    await employerApi.createJob(client, { ...body, companyId: company.id });
                  else await employerApi.updateJob(client, jobEdit.id, body);
                  setJobEdit(undefined);
                })
              }
            />
          ) : applicationId ? (
            <section>
              <h2>{t("employer.applicant")}</h2>
              {detail.isPending ? (
                <p role="status">{t("employer.loading")}</p>
              ) : detail.isError ? (
                <>
                  <p role="alert">{t("employer.error")}</p>
                  <button onClick={() => void detail.refetch()}>{t("employer.retry")}</button>
                </>
              ) : (
                <>
                  <h3>{detail.data.applicant.fullName ?? t("employer.deletedApplicant")}</h3>
                  <p>{detail.data.applicant.email}</p>
                  <p>{detail.data.applicant.phone}</p>
                  <p>
                    {t("employer.status")}: {t(`pelamar.status.${detail.data.status}`)}
                  </p>
                  <p>{t("employer.statusInfo")}</p>
                  <StatusForm
                    key={detail.data.status}
                    current={detail.data.status}
                    busy={busy}
                    onSave={(status, reason) =>
                      run(() => employerApi.status(client, applicationId, { status, reason }))
                    }
                  />
                  {detail.data.resume ? (
                    <Cv content={detail.data.resume.content} />
                  ) : (
                    <p>{t("employer.noCv")}</p>
                  )}
                </>
              )}
            </section>
          ) : job ? (
            <section>
              <h2>
                {job.title} · {t("employer.applicants")}
              </h2>
              {applications.isPending ? (
                <p role="status">{t("employer.loading")}</p>
              ) : applications.isError ? (
                <>
                  <p role="alert">{t("employer.error")}</p>
                  <button onClick={() => void applications.refetch()}>{t("employer.retry")}</button>
                </>
              ) : (
                <>
                  {applications.data.data.length === 0 && <p>{t("employer.noApplicants")}</p>}
                  <ul className="employer-list">
                    {applications.data.data.map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => {
                            action.reset();
                            setApplicationId(a.id);
                          }}
                        >
                          {a.applicant.fullName ?? t("employer.deletedApplicant")} ·{" "}
                          {t(`pelamar.status.${a.status}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {previous.length > 0 && (
                    <button
                      onClick={() => {
                        setCursor(previous.at(-1));
                        setPrevious((v) => v.slice(0, -1));
                      }}
                    >
                      {t("employer.previous")}
                    </button>
                  )}
                  {applications.data.meta.nextCursor && (
                    <button
                      onClick={() => {
                        setPrevious((v) => [...v, cursor]);
                        setCursor(applications.data.meta.nextCursor!);
                      }}
                    >
                      {t("employer.next")}
                    </button>
                  )}
                </>
              )}
            </section>
          ) : (
            <section>
              <div className="employer-toolbar">
                <h2>{t("employer.jobs")}</h2>
                <button
                  disabled={busy}
                  onClick={() => {
                    action.reset();
                    setJobEdit("new");
                  }}
                >
                  {t("employer.newJob")}
                </button>
              </div>
              {jobs.isPending ? (
                <p role="status">{t("employer.loading")}</p>
              ) : jobs.isError ? (
                <>
                  <p role="alert">{t("employer.error")}</p>
                  <button onClick={() => void jobs.refetch()}>{t("employer.retry")}</button>
                </>
              ) : (
                <>
                  {jobs.data.length === 0 && <p>{t("employer.noJobs")}</p>}
                  <ul className="employer-list">
                    {jobs.data.map((j) => (
                      <li key={j.id}>
                        <h3>{j.title}</h3>
                        <p>{t(`employer.${j.status}`)}</p>
                        <div className="employer-toolbar">
                          <button
                            disabled={busy}
                            onClick={() => {
                              action.reset();
                              setJobEdit(j);
                            }}
                          >
                            {t("employer.editJob")}
                          </button>
                          {j.status === "draft" && (
                            <button
                              disabled={
                                busy ||
                                company.recruitmentStatus !== "approved" ||
                                j.accommodations.length === 0
                              }
                              onClick={() =>
                                run(() => employerApi.jobAction(client, j.id, "publish"))
                              }
                            >
                              {t("employer.publish")}
                            </button>
                          )}
                          {j.status === "published" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                run(() => employerApi.jobAction(client, j.id, "close"))
                              }
                            >
                              {t("employer.close")}
                            </button>
                          )}
                          {company.recruitmentStatus === "approved" && j.status !== "draft" && (
                            <button
                              onClick={() => {
                                action.reset();
                                setJobId(j.id);
                              }}
                            >
                              {t("employer.applicants")}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

type CompanyBody = Parameters<typeof employerApi.register>[1];
function CompanyForm({
  value,
  busy,
  onSave,
}: {
  value?: EmployerCompany;
  busy: boolean;
  onSave(body: CompanyBody): void;
}) {
  const t = useTeks();
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [city, setCity] = useState(value?.city ?? "");
  const [website, setWebsite] = useState(value?.website ?? "");
  const [accommodations, setAccommodations] = useState<AccommodationNeed[]>(
    value?.accommodationsAvailable ?? [],
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          description: description || null,
          city: city || null,
          website: website || null,
          accommodationsAvailable: accommodations,
        });
      }}
    >
      <Field label={t("employer.field.name")} value={name} onChange={setName} required max={160} />
      <Field
        label={t("employer.field.description")}
        value={description}
        onChange={setDescription}
        multiline
        max={5000}
      />
      <Field label={t("employer.field.city")} value={city} onChange={setCity} max={80} />
      <Field
        label={t("employer.field.website")}
        value={website}
        onChange={setWebsite}
        type="url"
        max={500}
      />
      <Accommodations values={accommodations} onChange={setAccommodations} />
      <button disabled={busy}>{t(busy ? "employer.saving" : "employer.save")}</button>
    </form>
  );
}
type JobBody = Omit<Parameters<typeof employerApi.createJob>[1], "companyId">;
function JobForm({
  value,
  busy,
  onSave,
}: {
  value?: JobAdmin;
  busy: boolean;
  onSave(body: JobBody): void;
}) {
  const t = useTeks();
  const [title, setTitle] = useState(value?.title ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [requirements, setRequirements] = useState(value?.requirements ?? "");
  const [city, setCity] = useState(value?.city ?? "");
  const [workMode, setWorkMode] = useState<JobAdmin["workMode"]>(value?.workMode ?? "onsite");
  const [employmentType, setEmploymentType] = useState<JobAdmin["employmentType"]>(
    value?.employmentType ?? "full_time",
  );
  const [accommodations, setAccommodations] = useState<AccommodationNeed[]>(
    value?.accommodations ?? [],
  );
  const [min, setMin] = useState(value?.salaryMin?.toString() ?? "");
  const [max, setMax] = useState(value?.salaryMax?.toString() ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title,
          description,
          requirements: requirements || null,
          city: city || null,
          employmentType,
          workMode,
          accommodations,
          salaryMin: min === "" ? null : Number(min),
          salaryMax: max === "" ? null : Number(max),
          salaryVisible: min !== "" || max !== "",
        });
      }}
    >
      <h2>{t(value ? "employer.editJob" : "employer.newJob")}</h2>
      <Field
        label={t("employer.field.title")}
        value={title}
        onChange={setTitle}
        required
        max={200}
      />
      <Field
        label={t("employer.field.description")}
        value={description}
        onChange={setDescription}
        required
        multiline
        max={20000}
      />
      <Field
        label={t("employer.field.requirements")}
        value={requirements}
        onChange={setRequirements}
        multiline
        max={10000}
      />
      <Field label={t("employer.field.city")} value={city} onChange={setCity} max={80} />
      <label>
        {t("employer.field.employmentType")}
        <select
          value={employmentType}
          onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
        >
          {(["full_time", "part_time", "contract", "internship", "freelance"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`companies.lowongan.tipe.${v}` as KunciTeks)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("employer.field.workMode")}
        <select value={workMode} onChange={(e) => setWorkMode(e.target.value as typeof workMode)}>
          {(["onsite", "hybrid", "remote"] as const).map((v) => (
            <option key={v} value={v}>
              {t(`companies.lowongan.mode.${v}` as KunciTeks)}
            </option>
          ))}
        </select>
      </label>
      <Field label={t("employer.field.salaryMin")} value={min} onChange={setMin} type="number" />
      <Field label={t("employer.field.salaryMax")} value={max} onChange={setMax} type="number" />
      <Accommodations values={accommodations} onChange={setAccommodations} />
      <p>{t("employer.publishInfo")}</p>
      <button disabled={busy}>{t(busy ? "employer.saving" : "employer.save")}</button>
    </form>
  );
}
function Field({
  label,
  value,
  onChange,
  multiline,
  required,
  max,
  type = "text",
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  multiline?: boolean;
  required?: boolean;
  max?: number;
  type?: string;
}) {
  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          maxLength={max}
          rows={5}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          maxLength={max}
          min={type === "number" ? 0 : undefined}
        />
      )}
    </label>
  );
}
function Accommodations({
  values,
  onChange,
}: {
  values: AccommodationNeed[];
  onChange(v: AccommodationNeed[]): void;
}) {
  const t = useTeks();
  return (
    <fieldset>
      <legend>{t("employer.accommodations")}</legend>
      {ACCOMMODATION_NEEDS.map((v) => (
        <label className="employer-check" key={v}>
          <input
            type="checkbox"
            checked={values.includes(v)}
            onChange={(e) =>
              onChange(e.target.checked ? [...values, v] : values.filter((x) => x !== v))
            }
          />
          {t(`profil.akomodasi.${v}`)}
        </label>
      ))}
    </fieldset>
  );
}
function StatusForm({
  current,
  busy,
  onSave,
}: {
  current: ApplicationStatus;
  busy: boolean;
  onSave(status: ApplicationStatus, reason: string): void;
}) {
  const t = useTeks();
  const options = tujuanStatusSah(current, "employer");
  const [status, setStatus] = useState(options[0]);
  const [reason, setReason] = useState("");
  if (!status) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(status, reason);
      }}
    >
      <label>
        {t("employer.status")}
        <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {options.map((v) => (
            <option key={v} value={v}>
              {t(`pelamar.status.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <Field label={t("employer.reason")} value={reason} onChange={setReason} required max={200} />
      <button disabled={busy}>{t("employer.changeStatus")}</button>
    </form>
  );
}
function Cv({ content }: { content: ResumeContent }) {
  const t = useTeks();
  return (
    <article>
      <h3>{t("employer.cv")}</h3>
      <p>{content.headline}</p>
      <p>{content.summary}</p>
      {(["experiences", "educations", "skills", "certifications", "organizations"] as const).map(
        (section) => (
          <section key={section}>
            <h4>{t(`employer.${section}`)}</h4>
            <ul>
              {content[section].map((v, i) => (
                <li key={i}>
                  {Object.values(v)
                    .filter((x) => typeof x === "string")
                    .join(" · ")}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </article>
  );
}
export function EmployerReview() {
  const t = useTeks();
  const client = useKlienApi();
  const qc = useQueryClient();
  useJudulHalaman(t("shell.judulDokumen", { halaman: t("employer.review") }));
  const rows = useQuery({
    queryKey: ["admin", "employer-review"],
    queryFn: () => employerApi.reviews(client),
  });
  const action = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      employerApi.approval(client, id, status),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["admin", "employer-review"] });
    },
  });
  return (
    <div className="employer-portal">
      <h1>{t("employer.review")}</h1>
      <p>{t("employer.reviewInfo")}</p>
      {action.isError && <p role="alert">{t("employer.error")}</p>}
      {action.isSuccess && <p role="status">{t("employer.saved")}</p>}
      {rows.isPending ? (
        <p role="status">{t("employer.loading")}</p>
      ) : rows.isError ? (
        <>
          <p role="alert">{t("employer.error")}</p>
          <button onClick={() => void rows.refetch()}>{t("employer.retry")}</button>
        </>
      ) : (
        <>
          {!rows.data.length && <p>{t("employer.noReview")}</p>}
          <ul className="employer-list">
            {rows.data.map((c) => (
              <li key={c.id}>
                <h2>{c.name}</h2>
                <p>{c.description}</p>
                <p>
                  {c.city} · {c.website}
                </p>
                <p>{t(`employer.${c.recruitmentStatus}`)}</p>
                <div className="employer-toolbar">
                  {(["approved", "rejected"] as const).map((status) => (
                    <button
                      key={status}
                      disabled={action.isPending || status === c.recruitmentStatus}
                      onClick={() => action.mutate({ id: c.id, status })}
                    >
                      {t(status === "approved" ? "employer.approve" : "employer.reject")}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
