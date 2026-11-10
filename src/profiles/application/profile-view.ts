import { FileStorage } from '../../common/storage/file-storage';
import { ProfileBoard } from '../domain/ports/profiles.repository';

// Profile for the panel and the tablet: signed URLs (1 hour) for the avatar, pictograms and audio; never personal data.
// Audio of each pictogram (spec 010): the therapist's recording; otherwise the cloned voice (if the profile uses it); otherwise nothing.
export async function toProfileView({ profile, patientCode, avatarPath, voiceStatus, categories }: ProfileBoard, storage: FileStorage) {
  const { gridSize, activityLevel, speechRate, sentenceBarEnabled, version, voice } = profile;
  const { activityPrompts, activityRepeatSeconds, activityTypes } = profile;
  const cloned = voice === 'CLONED' && voiceStatus === 'READY';
  const sign = (path: string | null) => (path ? storage.signedUrl(path) : null);
  return {
    patientCode,
    avatarUrl: await storage.signedUrl(avatarPath),
    gridSize,
    activityLevel,
    speechRate,
    sentenceBarEnabled,
    activityPrompts,
    activityRepeatSeconds,
    activityTypes,
    voice,
    voiceStatus,
    profileVersion: version,
    categories: await Promise.all(
      categories.map(async ({ id, name, color, sortOrder, pictograms }) => ({
        id,
        name,
        color,
        sortOrder,
        pictograms: await Promise.all(
          pictograms.map(async ({ id: boardId, pictogram, sortOrder: order, hidden, usage, recordingPath, clipPath }) => {
            const audioPath = recordingPath ?? (cloned ? clipPath : null);
            return {
              id: boardId,
              pictogramId: pictogram.id,
              arasaacId: pictogram.arasaacId,
              label: pictogram.label,
              wordType: pictogram.wordType, // the board opens the category that usually follows (agreed 2026-10-25)
              imageUrl: await storage.signedUrl(pictogram.imagePath),
              sortOrder: order,
              hidden,
              ...usage,
              audioUrl: await sign(audioPath),
              audioSource: recordingPath ? 'recording' : audioPath ? 'cloned' : null,
            };
          }),
        ),
      })),
    ),
  };
}
