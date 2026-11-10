import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorage } from './file-storage';

const maxSignedUrls = 20_000; // ~12 MB: enough for all the images and audio of a Center

// Neon S3 bucket. The SDK reads AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION from the environment.
@Injectable()
export class S3FileStorage extends FileStorage {
  private readonly s3 = new S3Client({ forcePathStyle: true }); // Neon requires it with its own endpoint
  private readonly bucket: string;
  // Signing a URL costs ~0.3 ms of the main thread and a profiles page brings hundreds (820 signatures = 234 ms, k6 test,
  // test/perf/RESULTADOS.md): each URL is reused while at least half of its validity remains.
  private readonly signed = new Map<string, { url: string; reuseUntil: number }>();

  constructor(config: ConfigService) {
    super();
    this.bucket = config.get('S3_BUCKET', 'assets');
  }

  async put(path: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: path, Body: body, ContentType: contentType }));
  }

  async get(path: string) {
    const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
    return Buffer.from(await Body!.transformToByteArray());
  }

  async remove(path: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: path }));
    for (const key of this.signed.keys()) if (key.endsWith(`\n${path}`)) this.signed.delete(key);
  }

  async signedUrl(path: string, seconds = 3600) {
    const key = `${seconds}\n${path}`;
    const now = Date.now();
    const cached = this.signed.get(key);
    if (cached && cached.reuseUntil > now) return cached.url;
    const url = await getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: path }), { expiresIn: seconds });
    this.signed.delete(key); // goes back to the end: the Map keeps insertion order
    if (this.signed.size >= maxSignedUrls) this.signed.delete(this.oldestSigned());
    this.signed.set(key, { url, reuseUntil: now + (seconds * 1000) / 2 });
    return url;
  }

  private oldestSigned() {
    for (const key of this.signed.keys()) return key;
    return '';
  }
}
