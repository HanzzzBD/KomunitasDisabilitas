// Service jobs — boleh ke repository-nya sendiri + service modul lain.
import { jobsRepository } from "../repositories/jobs.repository";
import { usersService } from "../../users/services/users.service";

export const jobsService = {
  list: () => jobsRepository.findAll(),
  owner: () => usersService.current(),
};
