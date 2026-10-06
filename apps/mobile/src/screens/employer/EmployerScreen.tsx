import { useState } from "react";
import { View } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { employerApi, getMe, usersKeys, ApiError } from "@nawasena/api-client";
import {
  ACCOMMODATION_NEEDS,
  tujuanStatusSah,
  type AccommodationNeed,
  type EmployerCompany,
  type JobAdmin,
  type ApplicationStatus,
} from "@nawasena/schemas";
import { Tombol, Masukan, KotakCentang, PilihanTunggal } from "@nawasena/ui-native";
import { apiClient } from "../../api";
import { useSub } from "../../query";
import { Judul, LayarGulir, Paragraf, Memuat, PesanStatus } from "../../komponen/Layar";
import { STATUS } from "../../lamaran/teks";
import type { RootStackParamList } from "../../navigation/types";

const APPROVAL = {
  pending: "Menunggu persetujuan admin",
  approved: "Akses rekrutmen disetujui",
  rejected: "Akses rekrutmen ditolak. Hubungi admin.",
};
const JOB_STATUS = { draft: "Draft", published: "Tayang", closed: "Ditutup" };
const ACCOMMODATIONS: Record<AccommodationNeed, string> = {
  akses_kursi_roda: "Akses kursi roda",
  ramah_screen_reader: "Ramah pembaca layar",
  wawancara_via_teks: "Wawancara melalui teks",
  jam_kerja_fleksibel: "Jam kerja fleksibel",
  ruang_kerja_tenang: "Ruang kerja tenang",
  juru_bahasa_isyarat: "Juru bahasa isyarat",
};
export function EmployerScreen() {
  const sub = useSub();
  const qc = useQueryClient();
  const nav = useNavigation<NavigationProp<RootStackParamList>>();
  const key = ["employer", sub] as const;
  const me = useQuery({ queryKey: usersKeys.me(), queryFn: () => getMe(apiClient) });
  const role = me.data?.data.role;
  const [companyId, setCompanyId] = useState<string>();
  const [jobId, setJobId] = useState<string>();
  const [applicationId, setApplicationId] = useState<string>();
  const [editingCompany, setEditingCompany] = useState(false);
  const [editingJob, setEditingJob] = useState<JobAdmin | "new">();
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
    queryFn: () => employerApi.companies(apiClient),
    enabled: role === "employer",
  });
  const company = companies.data?.find((c) => c.id === companyId) ?? companies.data?.[0];
  const jobs = useQuery({
    queryKey: [...key, "jobs", company?.id],
    queryFn: () => employerApi.jobs(apiClient, company!.id),
    enabled: !!company,
  });
  const job = jobs.data?.find((j) => j.id === jobId);
  const applications = useQuery({
    queryKey: [...key, "applications", jobId, cursor],
    queryFn: () => employerApi.applications(apiClient, jobId!, cursor),
    enabled: !!jobId && company?.recruitmentStatus === "approved",
  });
  const detail = useQuery({
    queryKey: [...key, "application", applicationId],
    queryFn: () => employerApi.application(apiClient, applicationId!),
    enabled: !!applicationId,
  });
  const busy = action.isPending;
  const run = (fn: () => Promise<unknown>) => action.mutate(fn);
  const back = () => {
    setJobId(undefined);
    setApplicationId(undefined);
    setEditingCompany(false);
    setEditingJob(undefined);
    setCursor(undefined);
    setPrevious([]);
    action.reset();
  };
  return (
    <LayarGulir testID="employer-screen">
      <Judul>Ruang employer</Judul>
      <Paragraf>Kelola perusahaan, lowongan, dan pelamar.</Paragraf>
      {action.isError && (
        <PesanStatus
          galat
          pesan={
            action.error instanceof ApiError
              ? action.error.message
              : "Periksa isian formulir sebelum menyimpan."
          }
        />
      )}
      {action.isSuccess && <PesanStatus pesan="Perubahan tersimpan." />}
      {me.isPending || (role === "employer" && companies.isPending) ? (
        <Memuat label="Memuat perusahaan…" />
      ) : me.isError || companies.isError ? (
        <Retry
          onPress={() => {
            void me.refetch();
            void companies.refetch();
          }}
        />
      ) : role === "admin" ? (
        <Paragraf>Persetujuan employer tersedia di dashboard admin Web.</Paragraf>
      ) : !company ? (
        <>
          <Paragraf>
            Daftarkan perusahaan untuk mulai. Akun Anda menjadi employer setelah pendaftaran. Admin
            memeriksa perusahaan sebelum lowongan boleh ditayangkan.
          </Paragraf>
          <CompanyForm
            busy={busy}
            onSave={(body) =>
              run(async () => {
                const c = await employerApi.register(apiClient, body);
                setCompanyId(c.id);
              })
            }
          />
        </>
      ) : (
        <>
          {companies.data && companies.data.length > 1 && (
            <PilihanTunggal
              judul="Perusahaan"
              opsi={companies.data.map((c) => ({ nilai: c.id, label: c.name }))}
              nilai={company.id}
              onUbah={(id) => {
                back();
                setCompanyId(id);
              }}
            />
          )}
          <Judul tingkat={2}>{company.name}</Judul>
          <Paragraf tebal>{APPROVAL[company.recruitmentStatus]}</Paragraf>
          {company.recruitmentStatus !== "approved" && (
            <Paragraf>
              Anda bisa memperbarui perusahaan dan membuat draft. Tunggu persetujuan admin untuk
              menayangkan lowongan dan mengelola pelamar.
            </Paragraf>
          )}
          <Tombol
            label="Kembali ke daftar lowongan"
            varian="sekunder"
            onPress={back}
            nonaktif={busy}
          />
          {company.memberRole === "owner" && (
            <Tombol
              label="Edit perusahaan"
              varian="sekunder"
              nonaktif={busy}
              onPress={() => {
                back();
                setEditingCompany(true);
              }}
            />
          )}
          {editingCompany ? (
            <CompanyForm
              key={company.id}
              value={company}
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  await employerApi.updateCompany(apiClient, company.id, body);
                  setEditingCompany(false);
                })
              }
            />
          ) : editingJob ? (
            <JobForm
              key={editingJob === "new" ? "new" : editingJob.id}
              value={editingJob === "new" ? undefined : editingJob}
              busy={busy}
              onSave={(body) =>
                run(async () => {
                  if (editingJob === "new")
                    await employerApi.createJob(apiClient, { ...body, companyId: company.id });
                  else await employerApi.updateJob(apiClient, editingJob.id, body);
                  setEditingJob(undefined);
                })
              }
            />
          ) : applicationId ? (
            <>
              {detail.isPending ? (
                <Memuat label="Memuat pelamar…" />
              ) : detail.isError ? (
                <Retry onPress={() => void detail.refetch()} />
              ) : (
                <>
                  <Judul tingkat={2}>
                    {detail.data.applicant.fullName ?? "Akun pelamar sudah dihapus"}
                  </Judul>
                  <Paragraf>{detail.data.applicant.email}</Paragraf>
                  <Paragraf>{detail.data.applicant.phone}</Paragraf>
                  <Paragraf>Status: {STATUS[detail.data.status]}</Paragraf>
                  <Paragraf>Pelamar akan mendapat notifikasi saat status berubah.</Paragraf>
                  <StatusForm
                    key={detail.data.status}
                    current={detail.data.status}
                    busy={busy}
                    onSave={(status, reason) =>
                      run(() => employerApi.status(apiClient, applicationId, { status, reason }))
                    }
                  />
                  <Judul tingkat={2}>CV pelamar</Judul>
                  {detail.data.resume ? (
                    <>
                      <Paragraf>{detail.data.resume.content.headline}</Paragraf>
                      <Paragraf>{detail.data.resume.content.summary}</Paragraf>
                      {(
                        [
                          "experiences",
                          "educations",
                          "skills",
                          "certifications",
                          "organizations",
                        ] as const
                      ).map((section) => (
                        <View key={section} style={{ gap: 8 }}>
                          <Judul tingkat={2}>
                            {
                              {
                                experiences: "Pengalaman",
                                educations: "Pendidikan",
                                skills: "Keahlian",
                                certifications: "Sertifikat",
                                organizations: "Organisasi",
                              }[section]
                            }
                          </Judul>
                          {detail.data.resume!.content[section].map((v, i) => (
                            <Paragraf key={i}>
                              {Object.values(v)
                                .filter((x) => typeof x === "string")
                                .join(" · ")}
                            </Paragraf>
                          ))}
                        </View>
                      ))}
                    </>
                  ) : (
                    <Paragraf>Pelamar tidak melampirkan CV.</Paragraf>
                  )}
                </>
              )}
            </>
          ) : job ? (
            <>
              <Judul tingkat={2}>{`Pelamar: ${job.title}`}</Judul>
              {applications.isPending ? (
                <Memuat label="Memuat pelamar…" />
              ) : applications.isError ? (
                <Retry onPress={() => void applications.refetch()} />
              ) : (
                <>
                  {!applications.data.data.length && <Paragraf>Belum ada pelamar.</Paragraf>}
                  {applications.data.data.map((a) => (
                    <Tombol
                      key={a.id}
                      varian="sekunder"
                      label={`${a.applicant.fullName ?? "Akun dihapus"} · ${STATUS[a.status]}`}
                      onPress={() => {
                        action.reset();
                        setApplicationId(a.id);
                      }}
                    />
                  ))}
                  {previous.length > 0 && (
                    <Tombol
                      label="Pelamar sebelumnya"
                      onPress={() => {
                        setCursor(previous.at(-1));
                        setPrevious((v) => v.slice(0, -1));
                      }}
                    />
                  )}
                  {applications.data.meta.nextCursor && (
                    <Tombol
                      label="Pelamar berikutnya"
                      onPress={() => {
                        setPrevious((v) => [...v, cursor]);
                        setCursor(applications.data.meta.nextCursor!);
                      }}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Judul tingkat={2}>Lowongan perusahaan</Judul>
              <Tombol
                label="Buat lowongan"
                onPress={() => {
                  action.reset();
                  setEditingJob("new");
                }}
                nonaktif={busy}
              />
              {jobs.isPending ? (
                <Memuat label="Memuat lowongan…" />
              ) : jobs.isError ? (
                <Retry onPress={() => void jobs.refetch()} />
              ) : (
                <>
                  {!jobs.data.length && (
                    <Paragraf>Belum ada lowongan. Buat draft pertama Anda.</Paragraf>
                  )}
                  {jobs.data.map((j) => (
                    <View key={j.id} style={{ gap: 12, marginVertical: 12 }}>
                      <Judul tingkat={2}>{j.title}</Judul>
                      <Paragraf>{JOB_STATUS[j.status]}</Paragraf>
                      <Tombol
                        label={`Edit ${j.title}`}
                        varian="sekunder"
                        nonaktif={busy}
                        onPress={() => {
                          action.reset();
                          setEditingJob(j);
                        }}
                      />
                      {j.status === "draft" && (
                        <Tombol
                          label={`Tayangkan ${j.title}`}
                          nonaktif={
                            busy ||
                            company.recruitmentStatus !== "approved" ||
                            j.accommodations.length === 0
                          }
                          onPress={() =>
                            run(() => employerApi.jobAction(apiClient, j.id, "publish"))
                          }
                        />
                      )}
                      {j.status === "published" && (
                        <Tombol
                          label={`Tutup ${j.title}`}
                          varian="bahaya"
                          nonaktif={busy}
                          onPress={() => run(() => employerApi.jobAction(apiClient, j.id, "close"))}
                        />
                      )}
                      {j.status !== "draft" && company.recruitmentStatus === "approved" && (
                        <Tombol
                          label={`Lihat pelamar ${j.title}`}
                          varian="sekunder"
                          onPress={() => {
                            action.reset();
                            setJobId(j.id);
                          }}
                        />
                      )}
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </>
      )}
      <Tombol label="Notifikasi" varian="sekunder" onPress={() => nav.navigate("Notifikasi")} />
      <Tombol
        label="Pengaturan akun"
        varian="sekunder"
        onPress={() => nav.navigate("Pengaturan")}
      />
    </LayarGulir>
  );
}
function Retry({ onPress }: { onPress(): void }) {
  return (
    <>
      <PesanStatus galat pesan="Data belum bisa dimuat." />
      <Tombol label="Coba lagi" onPress={onPress} />
    </>
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
  const [name, setName] = useState(value?.name ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [city, setCity] = useState(value?.city ?? "");
  const [website, setWebsite] = useState(value?.website ?? "");
  const [accommodations, setAccommodations] = useState<AccommodationNeed[]>(
    value?.accommodationsAvailable ?? [],
  );
  return (
    <View style={{ gap: 16 }}>
      <Judul tingkat={2}>{value ? "Edit perusahaan" : "Daftarkan perusahaan"}</Judul>
      <Masukan label="Nama perusahaan" nilai={name} ubahNilai={setName} maxLength={160} />
      <Masukan
        label="Deskripsi perusahaan"
        nilai={description}
        ubahNilai={setDescription}
        multiline
        maxLength={5000}
      />
      <Masukan label="Kota" nilai={city} ubahNilai={setCity} maxLength={80} />
      <Masukan
        label="Situs perusahaan"
        nilai={website}
        ubahNilai={setWebsite}
        autoCapitalize="none"
        keyboardType="url"
        maxLength={500}
      />
      <Accommodations values={accommodations} onChange={setAccommodations} />
      <Tombol
        label="Simpan perusahaan"
        sibuk={busy}
        nonaktif={!name.trim()}
        onPress={() =>
          onSave({
            name,
            description: description || null,
            city: city || null,
            website: website || null,
            accommodationsAvailable: accommodations,
          })
        }
      />
    </View>
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
    <View style={{ gap: 16 }}>
      <Judul tingkat={2}>{value ? "Edit lowongan" : "Buat lowongan"}</Judul>
      <Masukan label="Judul lowongan" nilai={title} ubahNilai={setTitle} maxLength={200} />
      <Masukan
        label="Deskripsi pekerjaan"
        nilai={description}
        ubahNilai={setDescription}
        multiline
        maxLength={20000}
      />
      <Masukan
        label="Persyaratan"
        nilai={requirements}
        ubahNilai={setRequirements}
        multiline
        maxLength={10000}
      />
      <Masukan label="Kota" nilai={city} ubahNilai={setCity} maxLength={80} />
      <PilihanTunggal
        judul="Jenis pekerjaan"
        nilai={employmentType}
        onUbah={setEmploymentType}
        opsi={[
          { nilai: "full_time", label: "Purna waktu" },
          { nilai: "part_time", label: "Paruh waktu" },
          { nilai: "contract", label: "Kontrak" },
          { nilai: "internship", label: "Magang" },
          { nilai: "freelance", label: "Lepas" },
        ]}
      />
      <PilihanTunggal
        judul="Cara kerja"
        nilai={workMode}
        onUbah={setWorkMode}
        opsi={[
          { nilai: "onsite", label: "Di kantor" },
          { nilai: "hybrid", label: "Kadang di kantor, kadang dari rumah" },
          { nilai: "remote", label: "Dari rumah" },
        ]}
      />
      <Masukan
        label="Gaji minimum per bulan (Rp)"
        nilai={min}
        ubahNilai={setMin}
        keyboardType="numeric"
      />
      <Masukan
        label="Gaji maksimum per bulan (Rp)"
        nilai={max}
        ubahNilai={setMax}
        keyboardType="numeric"
      />
      <Accommodations values={accommodations} onChange={setAccommodations} />
      <Paragraf>Pilih minimal satu akomodasi sebelum lowongan ditayangkan.</Paragraf>
      <Tombol
        label="Simpan lowongan"
        sibuk={busy}
        nonaktif={!title.trim() || !description.trim()}
        onPress={() =>
          onSave({
            title,
            description,
            requirements: requirements || null,
            city: city || null,
            workMode,
            employmentType,
            accommodations,
            salaryMin: min === "" ? null : Number(min),
            salaryMax: max === "" ? null : Number(max),
            salaryVisible: min !== "" || max !== "",
          })
        }
      />
    </View>
  );
}
function Accommodations({
  values,
  onChange,
}: {
  values: AccommodationNeed[];
  onChange(values: AccommodationNeed[]): void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Paragraf tebal>Akomodasi yang tersedia</Paragraf>
      {ACCOMMODATION_NEEDS.map((v) => (
        <KotakCentang
          key={v}
          label={ACCOMMODATIONS[v]}
          dicentang={values.includes(v)}
          onUbah={(checked) => onChange(checked ? [...values, v] : values.filter((x) => x !== v))}
        />
      ))}
    </View>
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
  const options = tujuanStatusSah(current, "employer");
  const [status, setStatus] = useState(options[0]);
  const [reason, setReason] = useState("");
  if (!status) return null;
  return (
    <View style={{ gap: 16 }}>
      <PilihanTunggal
        judul="Status lamaran"
        opsi={options.map((v) => ({ nilai: v, label: STATUS[v] }))}
        nilai={status}
        onUbah={setStatus}
      />
      <Masukan
        label="Alasan perubahan status"
        nilai={reason}
        ubahNilai={setReason}
        maxLength={200}
      />
      <Tombol
        label="Perbarui status"
        sibuk={busy}
        nonaktif={!reason.trim()}
        onPress={() => onSave(status, reason)}
      />
    </View>
  );
}
