import {
  AUTHENTIC_GOOGLE_COLORS,
  CATEGORY_COLORS,
  CategoryMapping,
  DEFAULT_CATEGORY_MAPPINGS,
  ParsedDateInfo,
  parseFeedDate,
  getEventUniqueKey,
  detectExplicitOperationalEvidence,
  normalizeFeedEvent,
  getCityForDate,
  ValidationResult,
  validateFeedSchemaV1,
  SAMPLE_FICTIONAL_FEED_V1,
} from '../../shared/feedSchema.ts';

export {
  AUTHENTIC_GOOGLE_COLORS,
  CATEGORY_COLORS,
  type CategoryMapping,
  DEFAULT_CATEGORY_MAPPINGS,
  type ParsedDateInfo,
  parseFeedDate,
  getEventUniqueKey,
  detectExplicitOperationalEvidence,
  normalizeFeedEvent,
  getCityForDate,
  type ValidationResult,
  validateFeedSchemaV1,
  SAMPLE_FICTIONAL_FEED_V1,
};

/**
 * Downloads the marked sample JSON file to the user's computer.
 */
export function downloadSampleFeedJson(): void {
  const jsonString = JSON.stringify(SAMPLE_FICTIONAL_FEED_V1, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eritreavisit-sample-feed-v1-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
