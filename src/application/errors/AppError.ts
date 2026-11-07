export class AppError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly code: string = "APP_ERROR"
  ) {
    super(userMessage);
    this.name = "AppError";
  }
}
