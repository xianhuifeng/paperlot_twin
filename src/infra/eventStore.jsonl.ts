import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { EventStore, StoredEvent } from "./eventStore";

const dataDir = path.join(process.cwd(), "data");
const filePath = path.join(dataDir, "events.jsonl");

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(filePath); } catch { await fs.writeFile(filePath, ""); }
}

// 读全文件（POC 足够；后面可按 streamId 建索引或拆文件）
async function readAllLines(): Promise<any[]> {
  await ensureFile();
  const txt = await fs.readFile(filePath, "utf-8");
  if (!txt.trim()) return [];
  return txt.trimEnd().split("\n").map((l) => JSON.parse(l));
}

let writeQueue: Promise<StoredEvent<any> | void> = Promise.resolve(); // 简易串行队列，避免并发 append 打乱行

export function createJsonlEventStore<E = any>(): EventStore<E> {
  return {
    async append(streamId: string, event: E) {
      const storedPromise = writeQueue.then(async () => {
        await ensureFile();
        const all = await readAllLines();
        const lastSeq = all.length ? all[all.length - 1]._seq : 0;
        const stored: StoredEvent<E> = {
          ...(event as any),
          _id: crypto.randomUUID(),
          _seq: lastSeq + 1,
          _storedAt: new Date().toISOString(),
          streamId, // 可选：存一下
        };
        await fs.appendFile(filePath, JSON.stringify(stored) + "\n", "utf-8");
        return stored;
      });
      writeQueue = storedPromise;
      return storedPromise;
    },

    async load(streamId: string) {
      const all = await readAllLines();
      return all.filter((e) => e.streamId === streamId);
    },

    queryByTime(streamId: string, from?: string, to?: string): StoredEvent<E>[] {
      const all = readAllLinesSync();
      const filtered = all.filter((e) => {
        if (e.streamId !== streamId) return false;
        const occurredAt = e.occurredAt || e._storedAt;
        if (!occurredAt) return false;
        const time = new Date(occurredAt).getTime();
        if (from) {
          const fromTime = new Date(from).getTime();
          if (time < fromTime) return false;
        }
        if (to) {
          const toTime = new Date(to).getTime();
          if (time > toTime) return false;
        }
        return true;
      });
      return filtered.sort((a, b) => {
        const aTime = new Date(a.occurredAt || a._storedAt).getTime();
        const bTime = new Date(b.occurredAt || b._storedAt).getTime();
        return aTime - bTime;
      });
    },
  };
}

function readAllLinesSync(): any[] {
  try {
    const fsSync = require("fs");
    const txt = fsSync.readFileSync(filePath, "utf-8");
    if (!txt.trim()) return [];
    return txt.trimEnd().split("\n").map((l: string) => JSON.parse(l));
  } catch {
    return [];
  }
}
