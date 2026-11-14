import { createLocalTranscribeHandler } from "@/server/audio/local";

export const runtime = "nodejs";
export const maxDuration = 900;
export const POST = createLocalTranscribeHandler();
