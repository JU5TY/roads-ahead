// Builds a zip bit by bit (fflate), handing finished bytes to `write` as it goes,
// so an archive of any size never sits in memory whole.
import { Zip, ZipDeflate, strToU8 } from 'fflate';

// Compressed in small pieces, with a pause after each, so the screen keeps responding.
const PIECE_BYTES = 64 * 1024;

const pause = () => new Promise((resolve) => setTimeout(resolve));

/**
 * `write(bytes)` saves output and returns a promise. Add files one at a time:
 * finish each with `end()` before the next `addFile`, then call `end()` here.
 */
export function createZipWriter(write) {
  let pending = [];
  let failure = null;
  const zip = new Zip((err, bytes) => {
    if (err) failure = err;
    else pending.push(bytes);
  });
  const flush = async () => {
    if (failure) throw failure;
    const ready = pending;
    pending = [];
    for (const bytes of ready) await write(bytes);
  };
  return {
    addFile(name) {
      const entry = new ZipDeflate(name);
      zip.add(entry);
      return {
        async write(text) {
          const bytes = strToU8(text);
          for (let i = 0; i < bytes.length; i += PIECE_BYTES) {
            entry.push(bytes.subarray(i, i + PIECE_BYTES));
            await flush();
            await pause();
          }
        },
        async end() {
          entry.push(new Uint8Array(0), true);
          await flush();
        },
      };
    },
    async end() {
      zip.end();
      await flush();
    },
  };
}
