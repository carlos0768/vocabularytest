export interface InsufficientCoinsInfo {
  cost: number;
  monthlyRemaining: number;
  purchasedRemaining: number;
  totalRemaining: number;
  monthlyAllowance: number;
}

export class InsufficientCoinsError extends Error {
  constructor(
    message: string,
    public readonly coinInfo: InsufficientCoinsInfo | null,
  ) {
    super(message);
    this.name = 'InsufficientCoinsError';
  }
}
