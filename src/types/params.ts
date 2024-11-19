export interface CommonParams {
    path?: string;
    chainId?: number;
    confirmType?: 'confirm' | 'sign';
  }
  
  export type Response<T> = Promise<{
    success: boolean;
    payload?: T;
    error?: string;
  }>;