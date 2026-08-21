// modules/profiles — controller sub-entitas karier (PR-038).
//
// SATU controller untuk ketiga entitas, dengan alasan yang sama seperti
// `career.service.ts`: alurnya identik, dan salinan ketiga adalah tempat
// `actorOf` pertama kali diganti sesuatu yang membaca id dari badan permintaan.
//
// `authOf(req)` melempar bila route-nya tidak ber-guard, jadi identitas di sini
// tidak pernah `undefined` dan tidak pernah berasal dari body/query/params.
// Param `:id` yang dibaca di bawah adalah id ITEM, bukan id pengguna — ia
// dipakai sebagai penyaring bersama `userId` di repository, tidak pernah
// sendirian.
import type { Request, Response } from "express";
import type { CareerItemParams } from "@nawasena/schemas";
import type { BagianKarier } from "../services/career.service.js";
import { actorOf } from "./profiles.controller.js";

export function createKarierController<Item, Create, Update>(
  service: BagianKarier<Item, Create, Update>,
) {
  return {
    /** GET daftar → 200 `{ data: [...] }`. */
    async list(req: Request, res: Response): Promise<void> {
      res.status(200).json({ data: await service.list(actorOf(req)) });
    },

    /**
     * POST → 201 `{ data }` beserta `Location`.
     *
     * 201, bukan 200: klien (PR-040) menyimpan bagian demi bagian, dan yang
     * membedakan "baris baru lahir" dari "baris lama diperbarui" hanya status
     * ini. Tanpanya, formulir yang dikirim dua kali karena koneksi lambat
     * terlihat sama saja bagi klien — padahal barisnya kini ada dua.
     */
    async create(req: Request, res: Response): Promise<void> {
      const item = await service.create(actorOf(req), req.body as Create);
      res.status(201).json({ data: item });
    },

    /** PUT `/:id` → 200 `{ data }` setelah diperbarui. */
    async update(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CareerItemParams;
      res.status(200).json({ data: await service.update(actorOf(req), id, req.body as Update) });
    },

    /**
     * DELETE `/:id` → 204 tanpa badan.
     *
     * Bukan 200 dengan badan kosong: tidak ada yang bisa dikembalikan tentang
     * baris yang sudah tidak ada, dan klien yang mencoba memarse badan kosong
     * sebagai JSON akan gagal pada jawaban yang sebenarnya berhasil.
     */
    async remove(req: Request, res: Response): Promise<void> {
      const { id } = req.params as unknown as CareerItemParams;
      await service.remove(actorOf(req), id);
      res.status(204).end();
    },
  };
}

/**
 * Bentuk controller yang dipasang router — SENGAJA tidak generik.
 *
 * Router tidak perlu tahu entitas apa yang dilayani: yang ia pasang adalah empat
 * handler Express, dan tipe generik di sana hanya akan memaksa router menyebut
 * ulang ketiga entitasnya satu per satu.
 */
export type KarierController = {
  list(req: Request, res: Response): Promise<void>;
  create(req: Request, res: Response): Promise<void>;
  update(req: Request, res: Response): Promise<void>;
  remove(req: Request, res: Response): Promise<void>;
};
