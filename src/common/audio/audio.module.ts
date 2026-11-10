import { Module } from '@nestjs/common';
import { FfmpegWordAudio } from './ffmpeg-word-audio';
import { WordAudio } from './word-audio';

@Module({ providers: [{ provide: WordAudio, useClass: FfmpegWordAudio }], exports: [WordAudio] })
export class AudioModule {}
