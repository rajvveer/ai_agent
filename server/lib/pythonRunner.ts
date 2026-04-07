import { execFile } from 'child_process';
import path from 'path';

/**
 * Runs a Python script with the given input data piped to standard input.
 * 
 * @param scriptPath The path to the Python script relative to the project root
 * @param inputData The data to serialize and send to the script's stdin
 * @param timeoutMs The maximum execution time in milliseconds
 * @returns The parsed JSON output from the script
 */
export async function runPythonScript<T>(
  scriptPath: string,
  inputData: unknown,
  timeoutMs: number = 60000
): Promise<T> {
  return new Promise((resolve, reject) => {
    // Resolve absolute path from project root (assuming we run from a directory where process.cwd() is project root)
    // Or we can be explicit, `__dirname` typically isn't used in ESM without some setup, so paths are tricky.
    // Let's rely on process.cwd() base.
    const absolutePath = path.resolve(process.cwd(), scriptPath);
    
    // Use python on windows, python3 on Linux/macOS
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    const child = execFile(
      pythonCommand,
      [absolutePath],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer just in case
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Python script error (${scriptPath}):`, stderr || error.message);
          // Attempt to parse stdout for a structured error, if any
          try {
            if (stdout) {
              const errJson = JSON.parse(stdout);
              return reject(new Error(errJson.error || 'Python script failed'));
            }
          // eslint-disable-next-line no-empty
          } catch (e) {}
          return reject(error);
        }

        try {
          const result = JSON.parse(stdout) as T;
          // Check if the script caught an error but exited cleanly
          if ((result as any).error) {
            return reject(new Error((result as any).error));
          }
          resolve(result);
        } catch (parseError) {
          console.error('Failed to parse Python output. Raw output:', stdout);
          reject(new Error('Invalid JSON output from Python script'));
        }
      }
    );

    // Send input data to stdin and end it
    if (child.stdin) {
      child.stdin.write(JSON.stringify(inputData));
      child.stdin.end();
    }
  });
}
