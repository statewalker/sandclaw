import { describe, expect, it } from "vitest";
import {
  applyPreset,
  keyFromName,
  normalizeEndpoint,
  normalizePrefix,
  S3_PRESETS,
  type S3Form,
  validateKey,
  validateS3Form,
} from "../src/index.js";

const empty: S3Form = {
  name: "",
  key: "",
  preset: "other",
  endpoint: "",
  region: "",
  bucket: "",
  prefix: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathStyle: true,
  readOnly: false,
};

const valid: S3Form = {
  ...empty,
  name: "Archive",
  key: "archive",
  preset: "aws",
  endpoint: "https://s3.eu-west-3.amazonaws.com",
  region: "eu-west-3",
  bucket: "my-bucket",
  accessKeyId: "AKIA",
  secretAccessKey: "secret",
  pathStyle: false,
};

describe("mount settings: presets", () => {
  it("AWS uses the region placeholder and virtual-hosted addressing", () => {
    expect(S3_PRESETS.find((p) => p.id === "aws")).toEqual({
      id: "aws",
      label: "AWS S3",
      endpoint: "https://s3.<region>.amazonaws.com",
      region: "",
      pathStyle: false,
      regionRequired: true,
    });
  });

  it("R2 has an account placeholder and the region auto", () => {
    expect(S3_PRESETS.find((p) => p.id === "r2")).toMatchObject({
      endpoint: "https://<account-id>.r2.cloudflarestorage.com",
      region: "auto",
      pathStyle: false,
    });
  });

  it("MinIO/RustFS is local, us-east-1 and path-style", () => {
    expect(S3_PRESETS.find((p) => p.id === "minio")).toMatchObject({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      pathStyle: true,
      regionRequired: true,
    });
  });

  it("B2 and Wasabi use the region placeholder and require a region", () => {
    expect(S3_PRESETS.find((p) => p.id === "b2")).toMatchObject({
      endpoint: "https://s3.<region>.backblazeb2.com",
      region: "",
      pathStyle: false,
      regionRequired: true,
    });
    expect(S3_PRESETS.find((p) => p.id === "wasabi")).toMatchObject({
      endpoint: "https://s3.<region>.wasabisys.com",
      region: "",
      pathStyle: false,
      regionRequired: true,
    });
  });

  it("Other leaves everything to the user", () => {
    expect(S3_PRESETS.find((p) => p.id === "other")).toEqual({
      id: "other",
      label: "Other S3-compatible",
      endpoint: "",
      region: "",
      pathStyle: true,
      regionRequired: false,
    });
  });
});

describe("mount settings: applyPreset", () => {
  it("fills the endpoint, region and addressing from the preset", () => {
    expect(applyPreset(empty, "minio")).toMatchObject({
      preset: "minio",
      endpoint: "http://localhost:9000",
      region: "us-east-1",
      pathStyle: true,
    });
    expect(applyPreset(empty, "r2")).toMatchObject({
      endpoint: "https://<account-id>.r2.cloudflarestorage.com",
      region: "auto",
      pathStyle: false,
    });
  });

  it("substitutes a known region into the endpoint", () => {
    expect(applyPreset({ ...empty, region: "eu-west-3" }, "aws")).toMatchObject({
      endpoint: "https://s3.eu-west-3.amazonaws.com",
      region: "eu-west-3",
      pathStyle: false,
    });
  });

  it("keeps the placeholder in the endpoint when no region is known", () => {
    expect(applyPreset(empty, "aws")).toMatchObject({
      endpoint: "https://s3.<region>.amazonaws.com",
      region: "",
    });
    expect(applyPreset(empty, "b2")).toMatchObject({
      endpoint: "https://s3.<region>.backblazeb2.com",
      region: "",
    });
  });

  it("keeps the form's region when the preset's region is empty", () => {
    expect(applyPreset({ ...empty, region: "eu-west-3" }, "other")).toMatchObject({
      endpoint: "",
      region: "eu-west-3",
      pathStyle: true,
    });
  });

  it("takes the preset's region when the preset names one", () => {
    expect(applyPreset({ ...empty, region: "eu-central-1" }, "minio")).toMatchObject({
      endpoint: "http://localhost:9000",
      region: "us-east-1",
    });
  });
});

describe("mount settings: keys", () => {
  it("derives a key from the name", () => {
    expect(keyFromName("Archive (S3)", [])).toBe("archive-s3");
  });

  it("appends a counter when the derived key is taken", () => {
    expect(keyFromName("Archive (S3)", ["archive-s3"])).toBe("archive-s3-2");
  });

  it("reports an empty key", () => {
    expect(validateKey("", [])).toBe("Enter a key.");
  });

  it("refuses a key that starts with a dot", () => {
    expect(validateKey(".x", [])).toBe("A key can't start with a dot.");
  });

  it("allows only letters, digits, - and _ in a key", () => {
    expect(validateKey("a/b", [])).toBe("Use letters, digits, - and _ only.");
    expect(validateKey("a b", [])).toBe("Use letters, digits, - and _ only.");
    expect(validateKey("a?", [])).toBe("Use letters, digits, - and _ only.");
  });

  it("refuses a key another storage already uses", () => {
    expect(validateKey("docs", ["docs"])).toBe("Another storage already uses this key.");
  });
});

describe("mount settings: normalisation", () => {
  it("trims an endpoint and removes its trailing slash", () => {
    expect(normalizeEndpoint(" https://s3.example.com/ ")).toBe("https://s3.example.com");
  });

  it("collapses a prefix to single slashes with a trailing slash", () => {
    expect(normalizePrefix("/a//b")).toBe("a/b/");
  });

  it("keeps an empty prefix empty", () => {
    expect(normalizePrefix("")).toBe("");
  });
});

describe("mount settings: validation", () => {
  it("accepts a complete form", () => {
    expect(validateS3Form(valid, [])).toEqual({});
  });

  it("names every invalid field in plain words", () => {
    const errors = validateS3Form(
      {
        ...applyPreset(empty, "aws"),
        name: "A",
        key: "a",
        bucket: "My_Bucket",
        endpoint: "http://s3.example.com",
      },
      [],
    );
    expect(errors).toEqual({
      endpoint: "Use an https:// address (http:// only for localhost).",
      region: "This provider needs a region.",
      bucket: "Bucket names are 3–63 lowercase letters, digits, dots and dashes.",
      accessKeyId: "Enter the access key ID.",
      secretAccessKey: "Enter the secret access key.",
    });
  });

  it("requires a name", () => {
    expect(validateS3Form({ ...valid, name: "  " }, [])).toEqual({ name: "Enter a name." });
  });

  it("allows http:// only for localhost and 127.0.0.1", () => {
    expect(validateS3Form({ ...valid, endpoint: "http://localhost:9000" }, [])).toEqual({});
    expect(validateS3Form({ ...valid, endpoint: "http://127.0.0.1:9000" }, [])).toEqual({});
    expect(validateS3Form({ ...valid, endpoint: "http://example.com" }, [])).toEqual({
      endpoint: "Use an https:// address (http:// only for localhost).",
    });
  });

  it("refuses an endpoint that still holds a placeholder", () => {
    expect(validateS3Form({ ...valid, endpoint: "https://s3.<region>.amazonaws.com" }, [])).toEqual(
      { endpoint: "Replace the part in <…> with your value." },
    );
  });

  it("requires a region only when the preset needs one", () => {
    expect(validateS3Form({ ...valid, region: "" }, [])).toEqual({
      region: "This provider needs a region.",
    });
    expect(
      validateS3Form({ ...valid, preset: "other", region: "", endpoint: "https://x.test" }, []),
    ).toEqual({});
  });

  it("checks the bucket name shape", () => {
    expect(validateS3Form({ ...valid, bucket: "ab" }, [])).toEqual({
      bucket: "Bucket names are 3–63 lowercase letters, digits, dots and dashes.",
    });
    expect(validateS3Form({ ...valid, bucket: "abc" }, [])).toEqual({});
  });

  it("requires both credentials", () => {
    expect(validateS3Form({ ...valid, accessKeyId: "" }, [])).toEqual({
      accessKeyId: "Enter the access key ID.",
    });
    expect(validateS3Form({ ...valid, secretAccessKey: "" }, [])).toEqual({
      secretAccessKey: "Enter the secret access key.",
    });
  });

  it("validates the key against the keys already taken", () => {
    expect(validateS3Form({ ...valid, key: "docs" }, ["docs"])).toEqual({
      key: "Another storage already uses this key.",
    });
  });
});
