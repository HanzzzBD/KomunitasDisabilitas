// PELANGGARAN 1: service jobs mengimpor REPOSITORY modul lain (users) langsung.
// Antar-modul HANYA boleh via service layer → boundaries/element-types error.
import { usersRepository } from "../../users/repositories/users.repository";

export const jobsService = {
  ownerName: () => usersRepository.me(),
};
