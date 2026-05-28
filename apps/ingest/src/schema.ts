import { z } from "zod";

export const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);

export const EventPayloadSchema = z.object({
  source_ip: z
    .string()
    .ip({ version: "v4" })
    .or(z.string().ip({ version: "v6" })),
  event_type: z.enum([
    "file_upload",
    "network_connection",
    "process_spawn",
    "dns_query",
    "http_request",
    "login_attempt",
  ]),
  file_hash: z
    .string()
    .regex(/^[a-f0-9]{32}$|^[a-f0-9]{64}$/)
    .optional(),
  payload: z.record(z.unknown()).optional(),
  severity: SeverityEnum.optional().default("low"),
  mitre_tactic: z
    .string()
    .regex(/^TA\d{4}$/)
    .optional(),
  timestamp: z.string().datetime().optional(),
});

export type EventPayload = z.infer<typeof EventPayloadSchema>;
