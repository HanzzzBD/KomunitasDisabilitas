import { randomUUID } from "node:crypto";
import type { Request, Response, RequestHandler } from "express";
import type { CommunityReportTargetType, CommunityReportListQuery } from "@nawasena/schemas";
import { authOf } from "../../../core/auth/index.js";
import { asyncHandler } from "../../../core/http/index.js";
import type { CommunityContentService } from "../services/content.service.js";
const actor = (req: Request) => ({
  userId: authOf(req).userId,
  requestId: typeof req.id === "string" ? req.id : randomUUID(),
});
const type = (req: Request) => req.params.targetType as CommunityReportTargetType;

type Endpoint = (req: Request, res: Response) => Promise<void>;
export interface CommunityContentController {
  createLimit: RequestHandler;
  reportLimit: RequestHandler;
  createPost: Endpoint;
  post: Endpoint;
  editPost: Endpoint;
  erasePost: Endpoint;
  comment: Endpoint;
  editComment: Endpoint;
  eraseComment: Endpoint;
  createComment: Endpoint;
  comments: Endpoint;
  report: Endpoint;
  adminContent: Endpoint;
  moderate: Endpoint;
  reports: Endpoint;
  reject: Endpoint;
}
export function createCommunityContentController(
  service: CommunityContentService,
): CommunityContentController {
  const limit = (bucket: "create" | "report"): RequestHandler =>
    asyncHandler(async (req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      await service.checkRate(bucket, authOf(req).userId);
      next();
    });
  const detail = (target: CommunityReportTargetType) => async (req: Request, res: Response) => {
    res.json({ data: await service.detail(actor(req), target, req.params.id!) });
  };
  const edit = (target: CommunityReportTargetType) => async (req: Request, res: Response) => {
    res.json({
      data: await service.edit(actor(req), target, req.params.id!, req.body.body as string),
    });
  };
  const erase = (target: CommunityReportTargetType) => async (req: Request, res: Response) => {
    res.json({ data: await service.erase(actor(req), target, req.params.id!) });
  };
  return {
    createLimit: limit("create"),
    reportLimit: limit("report"),
    async createPost(req: Request, res: Response) {
      res.status(201).json({
        data: await service.createPost(actor(req), req.params.id!, req.body.body as string),
      });
    },
    post: detail("post"),
    editPost: edit("post"),
    erasePost: erase("post"),
    comment: detail("comment"),
    editComment: edit("comment"),
    eraseComment: erase("comment"),
    async createComment(req: Request, res: Response) {
      res.status(201).json({
        data: await service.createComment(actor(req), req.params.id!, req.body.body as string),
      });
    },
    async comments(req: Request, res: Response) {
      res.json(
        await service.comments(
          req.params.id!,
          req.query as unknown as { limit: number; cursor?: string },
        ),
      );
    },
    async report(req: Request, res: Response) {
      const result = await service.report(
        actor(req),
        type(req),
        req.params.targetId!,
        req.body.reason as string,
      );
      res.status(result.created ? 201 : 200).json({ data: result.data });
    },
    async adminContent(req: Request, res: Response) {
      res.json({ data: await service.adminContent(type(req), req.params.targetId!) });
    },
    async moderate(req: Request, res: Response) {
      res.json({
        data: await service.moderate(
          actor(req),
          type(req),
          req.params.targetId!,
          req.body.action,
          req.body.reason as string,
        ),
      });
    },
    async reports(req: Request, res: Response) {
      res.json(await service.reports(req.query as unknown as CommunityReportListQuery));
    },
    async reject(req: Request, res: Response) {
      res.json({
        data: await service.reject(actor(req), req.params.id!, req.body.reason as string),
      });
    },
  };
}
