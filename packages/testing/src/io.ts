/** Buffered standard I/O implementation for CLI command tests. */
export interface BufferedTestIO {
  io: {
    readStdin: () => Promise<string>;
    stderr: (message: string) => void;
    stdout: (message: string) => void;
  };
  stderr: string[];
  stdout: string[];
}

/** Creates deterministic stdin/stdout/stderr buffers for command tests. */
export function createBufferedTestIO(input = ""): BufferedTestIO {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      readStdin: async () => input,
      stderr: (message) => stderr.push(message),
      stdout: (message) => stdout.push(message),
    },
    stderr,
    stdout,
  };
}
