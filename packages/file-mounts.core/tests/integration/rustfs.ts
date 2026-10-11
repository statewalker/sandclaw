import { execFileSync } from "node:child_process";
import { CreateBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";

const IMAGE = process.env.RUSTFS_IMAGE ?? "rustfs/rustfs:1.0.0";
const KEYS = { accessKeyId: "rustfsadmin", secretAccessKey: "rustfsadmin" };

export function hasDocker(): boolean {
  try {
    execFileSync("docker", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A RustFS container on a free local port, with one bucket. */
export async function startRustFs(bucket = "files-core") {
  const name = `file-mounts-core-${process.pid}-${Date.now()}`;
  execFileSync("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "-p",
    "127.0.0.1::9000",
    "-e",
    `RUSTFS_ACCESS_KEY=${KEYS.accessKeyId}`,
    "-e",
    `RUSTFS_SECRET_KEY=${KEYS.secretAccessKey}`,
    "-e",
    "RUSTFS_VOLUMES=/data",
    IMAGE,
  ]);
  const stop = () => execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  try {
    const port = execFileSync("docker", ["port", name, "9000/tcp"])
      .toString()
      .trim()
      .split(":")
      .pop();
    const endpoint = `http://127.0.0.1:${port}`;
    const client = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: KEYS,
    });
    for (let tries = 0; ; tries++) {
      try {
        await client.send(new ListBucketsCommand({}));
        break;
      } catch (e) {
        if (tries > 120) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    return { endpoint, bucket, keys: KEYS, client, stop };
  } catch (e) {
    stop();
    throw e;
  }
}
