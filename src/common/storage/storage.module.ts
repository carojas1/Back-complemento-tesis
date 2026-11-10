import { Global, Module } from '@nestjs/common';
import { FileStorage } from './file-storage';
import { S3FileStorage } from './s3-file-storage';

@Global()
@Module({ providers: [{ provide: FileStorage, useClass: S3FileStorage }], exports: [FileStorage] })
export class StorageModule {}
