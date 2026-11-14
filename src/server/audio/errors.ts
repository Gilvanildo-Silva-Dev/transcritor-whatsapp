import "server-only";

export class TranscriptionError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "TranscriptionError";
    this.status = status;
  }
}
