// Service users — dipakai lintas modul (via service layer, diizinkan).
import { usersRepository } from "../repositories/users.repository";

export const usersService = {
  current: () => usersRepository.me(),
};
