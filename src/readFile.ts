import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// O_NONBLOCK keeps open() from waiting on a FIFO with no writer; it has no
// effect on regular files. It is undefined on Windows, which has no FIFOs.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0);

export type RegularFileRead =
  | { status: "ok"; content: string }
  | { status: "missing" }
  | { status: "not-a-file" }
  | { status: "too-large" };

/**
 * Read a regular file as UTF-8. The type and size are checked on the opened
 * descriptor, not the path, so the file cannot be swapped for a FIFO, device,
 * or larger file between the check and the read. Other errors are thrown.
 */
export function readRegularFileSync(
  path: string,
  maxBytes: number,
): RegularFileRead {
  let fd: number;
  try {
    fd = openSync(path, READ_FLAGS);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { status: "missing" };
    if (code === "EISDIR") return { status: "not-a-file" };
    throw err;
  }

  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return { status: "not-a-file" };
    if (stat.size > maxBytes) return { status: "too-large" };

    // Read at most the size seen above, even if the file grows meanwhile.
    const buffer = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = readSync(
        fd,
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    return {
      status: "ok",
      content: buffer.subarray(0, offset).toString("utf8"),
    };
  } finally {
    closeSync(fd);
  }
}
