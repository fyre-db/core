export class FyreDbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FyreDbConfigError';
  }
}
