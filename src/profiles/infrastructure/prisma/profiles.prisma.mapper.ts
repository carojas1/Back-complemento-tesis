import type * as db from '@prisma/client';
import { Profile } from '../../domain/entities/profile.entity';

// The only place that knows the Prisma shape of the profile.
export class ProfilesPrismaMapper {
  static toDomain(row: db.Profile) {
    const { id, patientId, gridSize, activityLevel, speechRate, sentenceBarEnabled, version } = row;
    const { activityPrompts, activityRepeatSeconds, activityTypes, voice } = row;
    return Profile.reconstitute({
      id,
      patientId,
      gridSize,
      activityLevel,
      speechRate,
      sentenceBarEnabled,
      activityPrompts,
      activityRepeatSeconds,
      activityTypes,
      voice,
      version,
    });
  }
}
