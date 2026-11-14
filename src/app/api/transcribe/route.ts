import { createTranscribeHandler } from "@/server/audio/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = createTranscribeHandler();
