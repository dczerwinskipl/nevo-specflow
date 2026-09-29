export interface ImportProgressUpdate {
  message: string;
  completed: number;
  total: number;
}

export type ImportProgress = (update: ImportProgressUpdate) => void;

export function createImportProgress(total: number, report: ImportProgress) {
  const boundedTotal = Math.max(Math.floor(total), 1);
  let completed = 0;

  const publish = (message: string) => {
    report({ message, completed, total: boundedTotal });
  };

  return {
    complete(message: string) {
      completed = Math.min(completed + 1, boundedTotal);
      publish(message);
    },
    async run<T>(message: string, action: () => Promise<T> | T) {
      publish(message);
      const result = await action();
      completed = Math.min(completed + 1, boundedTotal);
      publish(message);
      return result;
    },
  };
}

