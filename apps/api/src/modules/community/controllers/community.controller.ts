import { createHash, randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type {
  CommunityFeedQuery,
  CommunityListQuery,
  CreateCommunity,
  UpdateCommunity,
} from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { asyncHandler } from "../../../core/http/index.js";
import type { CommunityService } from "../services/community.service.js";

const actorOf = (req: Request) => ({
  userId: authOf(req).userId,
  requestId: typeof req.id === "string" ? req.id : randomUUID(),
});
type Endpoint = (req: Request, res: Response) => Promise<void>;
export interface CommunityController {
  readLimit: RequestHandler;
  writeLimit: RequestHandler;
  list: Endpoint;
  detail: Endpoint;
  membership: Endpoint;
  join: Endpoint;
  leave: Endpoint;
  feed: Endpoint;
  listAdmin: Endpoint;
  detailAdmin: Endpoint;
  create: Endpoint;
  update: Endpoint;
  archive: Endpoint;
}
export function createCommunityController(service: CommunityService): CommunityController {
  const limit = (bucket: "read" | "write"): RequestHandler =>
    asyncHandler(async (req, res, next) => {
      const key =
        req.auth?.userId ??
        createHash("sha256")
          .update(req.ip ?? "unknown")
          .digest("hex");
      await service.checkRate(bucket, key);
      res.setHeader("Cache-Control", "private, no-store");
      next();
    });
  return {
    readLimit: limit("read"),
    writeLimit: limit("write"),
    async list(req: Request, res: Response) {
      res.json(await service.list(req.query as unknown as CommunityListQuery));
    },
    async detail(req: Request, res: Response) {
      res.json({ data: await service.detail(req.params.slug!) });
    },
    async membership(req: Request, res: Response) {
      res.json({ data: await service.membership(authOf(req).userId, req.params.id!) });
    },
    async join(req: Request, res: Response) {
      res.json({ data: await service.join(actorOf(req), req.params.id!) });
    },
    async leave(req: Request, res: Response) {
      res.json({ data: await service.leave(actorOf(req), req.params.id!) });
    },
    async feed(req: Request, res: Response) {
      res.json(await service.feed(req.params.id!, req.query as unknown as CommunityFeedQuery));
    },
    async listAdmin(req: Request, res: Response) {
      res.json(await service.list(req.query as unknown as CommunityListQuery, true));
    },
    async detailAdmin(req: Request, res: Response) {
      res.json({ data: await service.detailAdmin(req.params.id!) });
    },
    async create(req: Request, res: Response) {
      res
        .status(201)
        .json({ data: await service.create(actorOf(req), req.body as CreateCommunity) });
    },
    async update(req: Request, res: Response) {
      res.json({
        data: await service.update(actorOf(req), req.params.id!, req.body as UpdateCommunity),
      });
    },
    async archive(req: Request, res: Response) {
      res.json({
        data: await service.update(actorOf(req), req.params.id!, { status: "archived" }),
      });
    },
  };
}
